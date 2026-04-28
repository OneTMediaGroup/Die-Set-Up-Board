import { isSupervisor, isAdmin } from './roles.js';
import { getSession } from './store.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import { activeSetupCount, equipmentLabel, getSlotsArray, renderPressQueueRow } from './supervisor-helpers.js';

let root = null;
let presses = [];
let unsubscribePresses = null;
let selectedPressId = '';
let selectedSlotIndex = '0';

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
        <p class="muted">Load or update the planned setups for each equipment slot.</p>
      </div>
    </div>

    <div class="admin-card">
      <div class="section-header">
        <div>
          <h2>Add / Update Setup</h2>
          <div id="dailyTarget" class="muted">Choose equipment and slot.</div>
        </div>
        <div class="topbar-right">
          <div class="header-stat"><span>Equipment</span><strong id="dailyPressCount">--</strong></div>
          <div class="header-stat"><span>Open Setups</span><strong id="dailySetupCount">--</strong></div>
        </div>
      </div>

      <form id="setupForm" class="form-grid" style="margin-top:16px;">
        <label>
          Equipment
          <select id="pressSelect" required></select>
        </label>
        <label>
          Slot
          <select id="slotSelect" required>
            <option value="0">Slot 1</option>
            <option value="1">Slot 2</option>
            <option value="2">Slot 3</option>
            <option value="3">Slot 4</option>
          </select>
        </label>
        <label>
          Part Number
          <input id="partInput" required placeholder="TT7896A" />
        </label>
        <label>
          Qty Remaining
          <input id="qtyInput" type="number" min="0" required placeholder="120" />
        </label>
        <label class="full-span">
          Notes
          <textarea id="notesInput" rows="3" placeholder="Supervisor instructions, timing notes, issue details..."></textarea>
        </label>
        <div class="form-actions full-span">
          <button type="submit" class="button primary">Save Setup</button>
          <button type="button" id="clearFormBtn" class="button">Clear Fields</button>
        </div>
      </form>
    </div>

    <div class="admin-card">
      <div class="section-header">
        <h2>Current Queue</h2>
        <button class="button" id="refreshDailyBtn">Refresh</button>
      </div>
      <div id="dailyQueue" class="supervisor-board" style="margin-top:12px;"></div>
    </div>
  `;

  root.querySelector('#setupForm')?.addEventListener('submit', handleSubmit);
  root.querySelector('#pressSelect')?.addEventListener('change', () => {
    selectedPressId = root.querySelector('#pressSelect')?.value || '';
    autofillForm();
    renderFromState();
  });
  root.querySelector('#slotSelect')?.addEventListener('change', () => {
    selectedSlotIndex = root.querySelector('#slotSelect')?.value || '0';
    autofillForm();
    renderFromState();
  });
  root.querySelector('#clearFormBtn')?.addEventListener('click', clearInputs);
  root.querySelector('#refreshDailyBtn')?.addEventListener('click', renderFromState);
}

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    if (!selectedPressId && presses[0]) selectedPressId = presses[0].id;
    renderFromState();
    autofillForm();
  });
}

function renderFromState() {
  if (!root) return;

  const pressSelect = root.querySelector('#pressSelect');
  const slotSelect = root.querySelector('#slotSelect');
  const dailyQueue = root.querySelector('#dailyQueue');
  const dailyPressCount = root.querySelector('#dailyPressCount');
  const dailySetupCount = root.querySelector('#dailySetupCount');
  const dailyTarget = root.querySelector('#dailyTarget');

  if (dailyPressCount) dailyPressCount.textContent = String(presses.length);
  if (dailySetupCount) dailySetupCount.textContent = String(activeSetupCount(presses));

  if (pressSelect) {
    const current = selectedPressId || pressSelect.value || presses[0]?.id || '';
    pressSelect.innerHTML = presses.map((press) => `<option value="${press.id}">${equipmentLabel(press)}</option>`).join('');
    if (current && presses.some((press) => press.id === current)) {
      pressSelect.value = current;
      selectedPressId = current;
    }
  }

  if (slotSelect) {
    slotSelect.value = selectedSlotIndex || '0';
  }

  const selectedPress = presses.find((press) => press.id === selectedPressId);
  if (dailyTarget) {
    dailyTarget.textContent = selectedPress
      ? `Target: ${equipmentLabel(selectedPress)} · Slot ${Number(selectedSlotIndex || 0) + 1}`
      : 'No equipment selected.';
  }

  if (dailyQueue) {
    dailyQueue.innerHTML = presses.length
      ? presses.map((press) => renderPressQueueRow(press, {
          selectedPressId,
          selectedSlotIndex,
          expanded: press.id === selectedPressId,
          showAddSetup: false,
          showMenu: false
        })).join('')
      : `<div class="muted">No equipment loaded yet.</div>`;

    dailyQueue.querySelectorAll('[data-toggle-press]').forEach((row) => {
      row.addEventListener('click', () => {
        selectedPressId = row.dataset.togglePress;
        selectedSlotIndex = '0';
        renderFromState();
        autofillForm();
      });
    });

    dailyQueue.querySelectorAll('[data-pick-press][data-pick-slot]').forEach((card) => {
      card.addEventListener('click', () => {
        selectedPressId = card.dataset.pickPress;
        selectedSlotIndex = card.dataset.pickSlot;
        renderFromState();
        autofillForm();
      });
    });
  }
}

function selectedSlot() {
  const press = presses.find((p) => p.id === selectedPressId);
  if (!press) return null;
  const slots = getSlotsArray(press);
  return { press, slot: slots[Number(selectedSlotIndex)] || null };
}

function autofillForm() {
  const data = selectedSlot();
  if (!data?.slot) return;

  const partInput = root.querySelector('#partInput');
  const qtyInput = root.querySelector('#qtyInput');
  const notesInput = root.querySelector('#notesInput');

  if (partInput) partInput.value = data.slot.partNumber || '';
  if (qtyInput) qtyInput.value = data.slot.qtyRemaining || '';
  if (notesInput) notesInput.value = data.slot.notes || '';
}

function clearInputs() {
  root.querySelector('#partInput').value = '';
  root.querySelector('#qtyInput').value = '';
  root.querySelector('#notesInput').value = '';
}

function validateSetupForm() {
  const partInput = root.querySelector('#partInput');
  const qtyInput = root.querySelector('#qtyInput');
  const notesInput = root.querySelector('#notesInput');
  const partNumber = partInput.value.trim();
  const qtyValue = Number(qtyInput.value);

  if (!partNumber) {
    alert('Part number is required.');
    partInput.focus();
    return null;
  }

  if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
    alert('Quantity must be greater than 0.');
    qtyInput.focus();
    return null;
  }

  return {
    partNumber,
    qtyRemaining: qtyValue,
    notes: notesInput.value.trim()
  };
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!(isSupervisor() || isAdmin())) {
    alert('Only supervisors or admins can update planned setups.');
    return;
  }

  const session = getSession() || { name: 'Supervisor Demo' };
  const validated = validateSetupForm();
  if (!validated) return;

  const data = selectedSlot();
  if (!data?.press || !data.slot) return;

  try {
    await updateSetupInFirestore({
      pressId: data.press.id,
      slotIndex: Number(selectedSlotIndex),
      userName: session.name,
      setup: {
        partNumber: validated.partNumber,
        qtyRemaining: validated.qtyRemaining,
        status: 'not_running',
        notes: validated.notes,
        previousSetup: data.slot || null,
        expectedUpdatedAt: data.slot?.updatedAt || null
      }
    });
  } catch (error) {
    if (error?.code === 'slot-conflict') {
      alert(`This slot was updated by ${error.lastUpdatedBy || 'another user'} before your save.\n\nPlease review the latest data and try again.`);
      return;
    }

    console.error('❌ Supervisor submit failed:', error);
    alert('Save setup failed.');
  }
}
