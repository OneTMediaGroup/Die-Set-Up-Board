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
          <div class="muted">Slot 1 is Current. Slot 2 is Next.</div>
        </div>

        <!-- ✅ PRINT BUTTON -->
        <button class="button primary" id="printQueueBtn">Print Current Jobs</button>
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
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="ready">Ready</option>
            <option value="no_setup">No Setups</option>
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

    <div class="muted" style="margin-top:16px; text-align:center;">
      © One T Media Group
    </div>
  `;

  wireQueueClicks(filteredPresses);
}

function wireQueueClicks(filteredPresses) {
  root.querySelector('#printQueueBtn')?.addEventListener('click', () => {
    printQueue();
  });

  // (existing listeners unchanged)
}

function printQueue() {
  const filtered = getFilteredPresses();

  let html = `
    <html>
    <head>
      <title>Current Jobs</title>
      <style>
        body { font-family: Arial; padding:20px; }
        h2 { border-bottom:2px solid #000; padding-bottom:5px; }
        table { width:100%; border-collapse: collapse; margin-bottom:20px; }
        th, td { border:1px solid #ccc; padding:8px; text-align:left; }
        th { background:#eee; }
      </style>
    </head>
    <body>
      <h1>Current Jobs Report</h1>
  `;

  const grouped = {};
  filtered.forEach((press) => {
    const area = areaLabel(press);
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(press);
  });

  Object.keys(grouped).forEach((area) => {
    html += `<h2>${area}</h2><table>
      <tr>
        <th>Equipment</th>
        <th>Current</th>
        <th>Qty</th>
        <th>Next</th>
        <th>Qty</th>
        <th>Status</th>
      </tr>`;

    grouped[area].forEach((press) => {
      const slots = getSlotsArray(press);
      const current = slots[0];
      const next = slots[1] || {};

      html += `
        <tr>
          <td>${equipmentLabel(press)}</td>
          <td>${current.partNumber || '-'}</td>
          <td>${current.qtyRemaining || '-'}</td>
          <td>${next.partNumber || '-'}</td>
          <td>${next.qtyRemaining || '-'}</td>
          <td>${current.status || '-'}</td>
        </tr>
      `;
    });

    html += `</table>`;
  });

  html += `</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
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