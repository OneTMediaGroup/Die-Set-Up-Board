import { getSession } from './store.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import {
  activeSetupCount,
  areaLabel,
  equipmentLabel,
  getSlotsArray,
  renderPressQueueRow
} from './supervisor-helpers.js';
import { normalizedSlotStatus } from './utils.js';

let root = null;
let presses = [];
let unsubscribePresses = null;
let expandedPressIds = new Set();

let searchText = '';
let areaFilter = 'all';
let statusFilter = 'all';

export async function mountQueueTool(container) {
  root = container;
  render([]);

  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    render(presses);
  });

  return () => {
    if (typeof unsubscribePresses === 'function') unsubscribePresses();
    unsubscribePresses = null;
    expandedPressIds = new Set();
  };
}

function getPressStatus(press) {
  const slots = getSlotsArray(press);
  const activeSlots = slots.filter((slot) => slot.partNumber);
  const readySlots = activeSlots.filter((slot, index) =>
    normalizedSlotStatus(slot.status, index, true) === 'ready'
  );

  if (!activeSlots.length) return 'no_setup';
  if (readySlots.length) return 'ready';
  return 'active';
}

function getFilteredPresses() {
  const search = searchText.trim().toLowerCase();

  return presses.filter((press) => {
    const slots = getSlotsArray(press);
    const text = [
      equipmentLabel(press),
      areaLabel(press),
      ...slots.map((slot) => `${slot.partNumber || ''} ${slot.notes || ''}`)
    ].join(' ').toLowerCase();

    const matchesSearch = !search || text.includes(search);
    const matchesArea = areaFilter === 'all' || areaLabel(press) === areaFilter;
    const matchesStatus = statusFilter === 'all' || getPressStatus(press) === statusFilter;

    return matchesSearch && matchesArea && matchesStatus;
  });
}

function getAreaOptions() {
  return [...new Set(presses.map(areaLabel).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function render(livePresses) {
  const filteredPresses = getFilteredPresses();

  const grouped = filteredPresses.reduce((groups, press) => {
    const label = areaLabel(press);
    if (!groups[label]) groups[label] = [];
    groups[label].push(press);
    return groups;
  }, {});

  const areaKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Current Queue</h2>
        <p class="muted">Search, expand, review, and edit current / next jobs.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Equipment</span><strong>${filteredPresses.length}</strong></div>
        <div class="header-stat"><span>Open Setups</span><strong>${activeSetupCount(filteredPresses)}</strong></div>
      </div>
    </div>

    <div class="admin-card queue-list-card">
      <div class="section-header">
        <div>
          <h2>Areas / Equipment</h2>
          <div class="muted">Slot 1 is Current. Slots 2-4 are Next.</div>
        </div>
        <button class="button primary" id="printQueueBtn">Print Visible Jobs</button>
      </div>

      <div style="display:grid; gap:10px; margin-top:14px;">
        <input
          id="queueSearchInput"
          value="${escapeAttr(searchText)}"
          placeholder="Search equipment, part, area, or notes..."
        />

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="queueAreaFilter">
            <option value="all">All Areas</option>
            ${getAreaOptions().map((area) => `
              <option value="${escapeAttr(area)}" ${areaFilter === area ? 'selected' : ''}>${escapeHtml(area)}</option>
            `).join('')}
          </select>

          <select id="queueStatusFilter">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active</option>
            <option value="ready" ${statusFilter === 'ready' ? 'selected' : ''}>Ready</option>
            <option value="no_setup" ${statusFilter === 'no_setup' ? 'selected' : ''}>No Setups</option>
          </select>

          <button class="button" id="expandAllQueueBtn">Expand All</button>
          <button class="button" id="collapseAllQueueBtn">Collapse All</button>
          <button class="button" id="clearQueueFiltersBtn">Clear Filters</button>
        </div>

        <div class="muted">${filteredPresses.length} shown · ${livePresses.length} total</div>
      </div>

      <div class="queue-area-list" style="margin-top:16px;">
        ${areaKeys.length ? areaKeys.map((area) => `
          <section class="queue-area-section">
            <div class="queue-area-header">
              <h3>${escapeHtml(area)}</h3>
              <span class="muted">${grouped[area].length} equipment</span>
            </div>

            <div class="queue-equipment-list">
              ${grouped[area]
                .sort((a, b) =>
                  String(equipmentLabel(a)).localeCompare(String(equipmentLabel(b)), undefined, { numeric: true })
                )
                .map((press) => renderPressQueueRow(press, {
                  expanded: expandedPressIds.has(press.id),
                  editable: true,
                  showAddSetup: false,
                  showMenu: false
                }))
                .join('')}
            </div>
          </section>
        `).join('') : `<div class="muted">No equipment matches the current filters.</div>`}
      </div>
    </div>

    
  `;

  wireQueueClicks(filteredPresses);
}

function wireQueueClicks(filteredPresses) {
  root.querySelector('#printQueueBtn')?.addEventListener('click', () => {
    printVisibleJobs();
  });

  root.querySelector('#queueSearchInput')?.addEventListener('input', (event) => {
    searchText = event.target.value;
    const cursorPosition = event.target.selectionStart || searchText.length;

    render(presses);

    const input = root.querySelector('#queueSearchInput');
    if (input) {
      input.focus();
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  });

  root.querySelector('#queueAreaFilter')?.addEventListener('change', (event) => {
    areaFilter = event.target.value;
    render(presses);
  });

  root.querySelector('#queueStatusFilter')?.addEventListener('change', (event) => {
    statusFilter = event.target.value;
    render(presses);
  });

  root.querySelector('#clearQueueFiltersBtn')?.addEventListener('click', () => {
    searchText = '';
    areaFilter = 'all';
    statusFilter = 'all';
    render(presses);
  });

  root.querySelectorAll('[data-toggle-press]').forEach((button) => {
    button.addEventListener('click', () => {
      const pressId = button.dataset.togglePress;
      if (!pressId) return;

      if (expandedPressIds.has(pressId)) expandedPressIds.delete(pressId);
      else expandedPressIds.add(pressId);

      render(presses);
    });
  });

  root.querySelector('#expandAllQueueBtn')?.addEventListener('click', () => {
    expandedPressIds = new Set(filteredPresses.map((press) => press.id));
    render(presses);
  });

  root.querySelector('#collapseAllQueueBtn')?.addEventListener('click', () => {
    expandedPressIds = new Set();
    render(presses);
  });

  root.querySelectorAll('[data-save-slot]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await saveInlineSlot(button.dataset.saveSlot, Number(button.dataset.slotIndex));
    });
  });

  root.querySelectorAll('[data-ready-slot]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await markInlineReady(button.dataset.readySlot, Number(button.dataset.slotIndex));
    });
  });

  root.querySelectorAll('[data-clear-slot]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await clearInlineSlot(button.dataset.clearSlot, Number(button.dataset.slotIndex));
    });
  });
}

function printVisibleJobs() {
  const visiblePresses = getFilteredPresses();
  const printedAt = new Date().toLocaleString();

  const grouped = visiblePresses.reduce((groups, press) => {
    const label = areaLabel(press);
    if (!groups[label]) groups[label] = [];
    groups[label].push(press);
    return groups;
  }, {});

  const areaKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  const filterLabel = [
    areaFilter === 'all' ? 'All Areas' : areaFilter,
    statusFilter === 'all' ? 'All Statuses' : statusFilter
  ].join(' · ');

  const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Current Jobs</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          color: #111827;
          padding: 24px;
        }
        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          border-bottom: 3px solid #111827;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        h1 {
          margin: 0;
          font-size: 26px;
        }
        .muted {
          color: #6b7280;
          font-size: 13px;
        }
        .area-title {
          margin: 22px 0 8px;
          padding: 8px 10px;
          background: #eef2f7;
          border-left: 6px solid #2563eb;
          font-size: 18px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          page-break-inside: avoid;
        }
        th, td {
          border: 1px solid #d1d5db;
          padding: 8px;
          text-align: left;
          vertical-align: top;
          font-size: 12px;
        }
        th {
          background: #f3f4f6;
          font-weight: 800;
        }
        .ready {
          font-weight: 800;
          color: #166534;
        }
        .blocked {
          font-weight: 800;
          color: #991b1b;
        }
        .footer {
          margin-top: 22px;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
        @media print {
          body { padding: 12px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-header">
        <div>
          <h1>Current Jobs Report</h1>
          <div class="muted">${escapeHtml(filterLabel)}</div>
        </div>
        <div class="muted">
          Printed: ${escapeHtml(printedAt)}<br>
          Equipment shown: ${visiblePresses.length}
        </div>
      </div>

      ${areaKeys.length ? areaKeys.map((area) => `
        <h2 class="area-title">${escapeHtml(area)}</h2>
        <table>
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Current Part</th>
              <th>Current Qty</th>
              <th>Current Status</th>
              <th>Next Part</th>
              <th>Next Qty</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${grouped[area]
              .sort((a, b) => String(equipmentLabel(a)).localeCompare(String(equipmentLabel(b)), undefined, { numeric: true }))
              .map((press) => {
                const slots = getSlotsArray(press);
                const current = slots[0] || {};
                const next = slots.slice(1).find((slot) => slot.partNumber) || {};
                const currentStatus = current.partNumber
                  ? normalizedSlotStatus(current.status, 0, true)
                  : 'no_setup';

                return `
                  <tr>
                    <td><strong>${escapeHtml(equipmentLabel(press))}</strong></td>
                    <td>${escapeHtml(current.partNumber || '—')}</td>
                    <td>${current.partNumber ? escapeHtml(current.qtyRemaining || 0) : '—'}</td>
                    <td class="${currentStatus === 'ready' ? 'ready' : currentStatus === 'blocked' ? 'blocked' : ''}">
                      ${current.partNumber ? escapeHtml(currentStatus.replaceAll('_', ' ')) : '—'}
                    </td>
                    <td>${escapeHtml(next.partNumber || '—')}</td>
                    <td>${next.partNumber ? escapeHtml(next.qtyRemaining || 0) : '—'}</td>
                    <td>${escapeHtml(current.notes || next.notes || '—')}</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `).join('') : `<p>No visible jobs found for current filters.</p>`}

      <div class="footer">© One T Media Group</div>

      <script>
        window.onload = function () {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Popup blocked. Please allow popups to print current jobs.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(content);
  printWindow.document.close();
}

function getPressAndSlot(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return null;
  const slots = getSlotsArray(press);
  const slot = slots[slotIndex];
  return { press, slot };
}

function getInlineForm(pressId, slotIndex) {
  return root.querySelector(`[data-inline-press="${pressId}"][data-inline-slot="${slotIndex}"]`);
}

async function saveInlineSlot(pressId, slotIndex) {
  const form = getInlineForm(pressId, slotIndex);
  const data = getPressAndSlot(pressId, slotIndex);
  if (!form || !data) return;

  const partNumber = form.querySelector('[data-slot-part]')?.value.trim() || '';
  const qtyValue = Number(form.querySelector('[data-slot-qty]')?.value || 0);
  const notes = form.querySelector('[data-slot-notes]')?.value.trim() || '';

  if (!partNumber) {
    alert('Part number is required. Use Clear to remove a setup.');
    return;
  }

  if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
    alert('Quantity must be greater than 0.');
    return;
  }

  const session = getSession() || { name: 'Supervisor Demo' };

  try {
    await updateSetupInFirestore({
      pressId,
      slotIndex,
      userName: session.name,
      setup: {
        partNumber,
        qtyRemaining: qtyValue,
        status: slotIndex === 0 ? 'current' : 'next',
        notes,
        previousSetup: data.slot || null,
        expectedUpdatedAt: data.slot?.updatedAt || null
      }
    });

    alert('Setup saved.');
  } catch (error) {
    handleSaveError(error);
  }
}

async function markInlineReady(pressId, slotIndex) {
  const data = getPressAndSlot(pressId, slotIndex);
  if (!data?.slot?.partNumber) return;

  const session = getSession() || { name: 'Supervisor Demo' };

  try {
    await updateSetupInFirestore({
      pressId,
      slotIndex,
      userName: session.name,
      setup: {
        partNumber: data.slot.partNumber,
        qtyRemaining: data.slot.qtyRemaining,
        status: 'ready',
        notes: data.slot.notes || '',
        previousSetup: data.slot,
        expectedUpdatedAt: data.slot.updatedAt || null
      }
    });
  } catch (error) {
    handleSaveError(error);
  }
}

async function clearInlineSlot(pressId, slotIndex) {
  const data = getPressAndSlot(pressId, slotIndex);
  if (!data?.slot?.partNumber) return;

  if (!confirm(`Clear ${equipmentLabel(data.press)} Slot ${slotIndex + 1}?`)) return;

  const session = getSession() || { name: 'Supervisor Demo' };

  try {
    await updateSetupInFirestore({
      pressId,
      slotIndex,
      userName: session.name,
      setup: {
        partNumber: '',
        qtyRemaining: 0,
        status: 'next',
        notes: '',
        previousSetup: data.slot,
        expectedUpdatedAt: data.slot.updatedAt || null
      }
    });
  } catch (error) {
    handleSaveError(error);
  }
}

function handleSaveError(error) {
  if (error?.code === 'slot-conflict') {
    alert(`This slot was updated by ${error.lastUpdatedBy || 'another user'} before your save. Please review the latest data and try again.`);
    return;
  }

  console.error('❌ Queue inline save failed:', error);
  alert('Save failed.');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}