import { isSupervisor, isAdmin } from './roles.js';
import { getSession } from './store.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import { activeSetupCount, areaLabel, equipmentLabel, getSlotsArray, renderPressQueueRow } from './supervisor-helpers.js';

let root = null;
let presses = [];
let unsubscribePresses = null;
let selectedPressId = '';
let selectedSlotIndex = '0';
let expandedPressId = '';

export async function mountDailySetupTool(container) {
  root = container;
  renderShell();
  startPressWatcher();

  return () => {
    if (typeof unsubscribePresses === 'function') unsubscribePresses();
    unsubscribePresses = null;
  };
}

function renderShell() {
  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Daily Setup</h2>
        <p class="muted">Edit setups directly inside each expanded equipment row.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Equipment</span><strong id="dailyPressCount">--</strong></div>
        <div class="header-stat"><span>Open Setups</span><strong id="dailySetupCount">--</strong></div>
      </div>
    </div>

    <div class="admin-card queue-list-card">
      <div class="section-header">
        <div>
          <h2>Current / Next Queue</h2>
          <div class="muted">Slot 1 is Current. Slots 2-4 are Next. Expand a row to edit the slots.</div>
        </div>
        <button class="button" id="refreshDailyBtn">Refresh</button>
      </div>
      <div id="dailyQueue" class="queue-area-list" style="margin-top:16px;"></div>
    </div>
  `;

  root.querySelector('#refreshDailyBtn')?.addEventListener('click', renderFromState);
}

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    if (!selectedPressId && presses[0]) selectedPressId = presses[0].id;
    renderFromState();
  });
}

function renderFromState() {
  if (!root) return;

  const dailyQueue = root.querySelector('#dailyQueue');
  const dailyPressCount = root.querySelector('#dailyPressCount');
  const dailySetupCount = root.querySelector('#dailySetupCount');

  if (dailyPressCount) dailyPressCount.textContent = String(presses.length);
  if (dailySetupCount) dailySetupCount.textContent = String(activeSetupCount(presses));

  if (!dailyQueue) return;

  const grouped = presses.reduce((groups, press) => {
    const label = areaLabel(press);
    if (!groups[label]) groups[label] = [];
    groups[label].push(press);
    return groups;
  }, {});

  const areaKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  dailyQueue.innerHTML = areaKeys.length
    ? areaKeys.map((area) => `
        <section class="queue-area-section">
          <div class="queue-area-header">
            <h3>${area}</h3>
            <span class="muted">${grouped[area].length} equipment</span>
          </div>
          <div class="queue-equipment-list">
            ${grouped[area]
              .sort((a, b) => String(equipmentLabel(a)).localeCompare(String(equipmentLabel(b)), undefined, { numeric: true }))
              .map((press) => renderPressQueueRow(press, {
                selectedPressId,
                selectedSlotIndex,
                expanded: press.id === expandedPressId,
                editable: true,
                showAddSetup: false,
                showMenu: false
              }))
              .join('')}
          </div>
        </section>
      `).join('')
    : `<div class="muted">No equipment loaded yet.</div>`;

  wireDailyQueue();
}

function wireDailyQueue() {
  root.querySelectorAll('[data-toggle-press]').forEach((row) => {
    row.addEventListener('click', () => {
      const pressId = row.dataset.togglePress;
      if (!pressId) return;

      if (expandedPressId === pressId) {
        expandedPressId = '';
      } else {
        expandedPressId = pressId;
        selectedPressId = pressId;
        selectedSlotIndex = '0';
      }

      renderFromState();
    });
  });

  root.querySelectorAll('[data-pick-press][data-pick-slot]').forEach((card) => {
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedPressId = card.dataset.pickPress;
      expandedPressId = card.dataset.pickPress;
      selectedSlotIndex = card.dataset.pickSlot;
      renderFromState();
    });
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
  if (!(isSupervisor() || isAdmin())) {
    alert('Only supervisors or admins can update planned setups.');
    return;
  }

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

  console.error('❌ Supervisor inline save failed:', error);
  alert('Save failed.');
}
