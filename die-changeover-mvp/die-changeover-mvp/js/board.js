import { initStore, getSession, setSession } from './store.js';
import { formatTime, formatDateTime, statusLabel } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';

initStore();

const pressGrid = document.getElementById('pressGrid');
const syncTimeBoard = document.getElementById('syncTimeBoard');
const currentUserBoard = document.getElementById('currentUserBoard');
const setupDialog = document.getElementById('setupDialog');
const areaFilterBoard = document.getElementById('areaFilterBoard');
const shiftFilterBoard = document.getElementById('shiftFilterBoard');
const refreshBoardBtn = document.getElementById('refreshBoardBtn');
const dialogNotes = document.getElementById('dialogNotes');

let selected = null;
let presses = [];
let unsubscribePresses = null;
let isSubmitting = false;

bootstrapSession();
wireDialog();
startPressWatcher();

function bootstrapSession() {
  const session = getSession() || { id: 'u1', name: 'Bab S.', role: 'dieSetter' };
  setSession(session);
  currentUserBoard.textContent = `${session.name} · ${session.role}`;
}

function getSlotsArray(press) {
  if (Array.isArray(press.slots)) return press.slots;
  return Object.values(press.slots || {});
}

function getSelectedPressAndSlot() {
  if (!selected) return null;

  const press = presses.find((item) => item.id === selected.pressId);
  if (!press) return null;

  const slots = getSlotsArray(press);
  const slot = slots[selected.slotIndex];
  if (!slot) return null;

  return { press, slot };
}

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    renderBoard();

    if (setupDialog.open && selected) {
      refreshOpenDialog();
    }
  });
}

function renderBoard() {
  const visiblePresses = filteredPresses();
  syncTimeBoard.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  pressGrid.innerHTML = visiblePresses.map((press) => {
    const slots = getSlotsArray(press);

    return `
      <article class="press-row">
        <div class="press-row-header">
          <div>
            <h3>Press ${press.pressNumber}</h3>
            <div class="muted">${press.area} · Shift ${press.shift}</div>
          </div>
          <div class="muted">${slots.filter((slot) => slot.partNumber).length} active setups</div>
        </div>
        <div class="slot-grid">
          ${slots.map((slot, slotIndex) => renderSlot(press, slot, slotIndex)).join('')}
        </div>
      </article>
    `;
  }).join('');

  pressGrid.querySelectorAll('[data-open-setup]').forEach((button) => {
    button.addEventListener('click', () => openSetup(button.dataset.pressId, Number(button.dataset.slotIndex)));
  });
}

function renderSlot(press, slot, slotIndex) {
  const empty = !slot.partNumber;
  const displayStatus = empty ? 'no_setup' : slot.status;

  return `
    <section class="slot-card">
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(slot.status)}</span>
      </div>
      <div class="slot-meta">
        <div class="meta-box"><span>Part</span><strong>${slot.partNumber || '—'}</strong></div>
        <div class="meta-box"><span>Qty</span><strong>${slot.partNumber ? slot.qtyRemaining : '—'}</strong></div>
      </div>
      <div class="slot-note">${slot.notes || 'No notes added.'}</div>
      <div class="slot-actions">
        <button class="button primary full" data-open-setup data-press-id="${press.id}" data-slot-index="${slotIndex}">
          ${empty ? 'View Notes' : 'Open Actions'}
        </button>
      </div>
      <div class="muted">Updated ${formatTime(slot.updatedAt)}</div>
    </section>
  `;
}

function openSetup(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  const slots = getSlotsArray(press);
  const slot = slots[slotIndex];
  if (!slot) return;

  selected = { pressId, slotIndex, pressNumber: press.pressNumber };
  fillDialog(press, slot, slotIndex);
  setupDialog.showModal();
}

function refreshOpenDialog() {
  const data = getSelectedPressAndSlot();
  if (!data) return;

  const { press, slot } = data;
  fillDialog(press, slot, selected.slotIndex);
}

function fillDialog(press, slot, slotIndex) {
  const empty = !slot.partNumber;

  document.getElementById('dialogTitle').textContent = `Press ${press.pressNumber} · Slot ${slotIndex + 1}`;
  document.getElementById('dialogSubtitle').textContent = `${press.area} · Shift ${press.shift}`;
  document.getElementById('dialogPart').textContent = slot.partNumber || '—';
  document.getElementById('dialogQty').textContent = slot.partNumber ? String(slot.qtyRemaining) : '—';
  document.getElementById('dialogStatus').textContent = slot.partNumber ? statusLabel(slot.status) : 'No setup';
  document.getElementById('dialogUpdated').textContent = formatDateTime(slot.updatedAt);
  dialogNotes.value = slot.notes || '';

  updateDialogActionState(empty);
}

function updateDialogActionState(empty) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = button.dataset.action;
    const isNotesOnly = action === 'save_notes';

    if (empty) {
      button.disabled = !isNotesOnly;
      button.title = isNotesOnly ? '' : 'Load a setup from the supervisor screen before changing status.';
    } else {
      button.disabled = false;
      button.title = action === 'clear' ? 'This will remove the setup from this slot.' : '';
    }
  });
}

function wireDialog() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDialogAction(button.dataset.action);
    });
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dialogNotes.value = dialogNotes.value
        ? `${dialogNotes.value}\n${chip.dataset.note}`
        : chip.dataset.note;
    });
  });

  areaFilterBoard.addEventListener('change', renderBoard);
  shiftFilterBoard.addEventListener('change', renderBoard);
  refreshBoardBtn.addEventListener('click', renderBoard);

  setupDialog.addEventListener('close', () => {
    selected = null;
    isSubmitting = false;
    setDialogBusyState(false);
  });
}

function setDialogBusyState(isBusy) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    if (button.dataset.action === 'save_notes') {
      button.disabled = isBusy;
      return;
    }

    const data = getSelectedPressAndSlot();
    const empty = !data || !data.slot.partNumber;

    if (empty && button.dataset.action !== 'save_notes') {
      button.disabled = true;
    } else {
      button.disabled = isBusy;
    }
  });

  if (dialogNotes) {
    dialogNotes.disabled = isBusy;
  }
}

function requireBlockReason() {
  const reason = dialogNotes.value.trim();

  if (reason) return true;

  alert(
    'Please add a reason before flagging Maintenance.\n\nExamples:\n- Tooling issue\n- Material missing\n- Machine fault\n- Waiting on maintenance'
  );

  dialogNotes.focus();
  return false;
}

async function handleDialogAction(action) {
  if (!selected || isSubmitting) return;

  const session = getSession() || { name: 'Demo User' };
  const data = getSelectedPressAndSlot();
  if (!data) return;

  const { slot } = data;
  const empty = !slot.partNumber;

  if (empty && action !== 'save_notes') {
    alert('This slot has no active setup yet. Use the supervisor screen to add one first.');
    return;
  }

  if (action === 'blocked' && !requireBlockReason()) {
    return;
  }

  if (action === 'clear') {
    const confirmed = window.confirm(
      `Clear setup for Press ${selected.pressNumber} Slot ${selected.slotIndex + 1}?\n\nThis removes the part number, quantity, status, and notes from this slot.`
    );

    if (!confirmed) return;
  }

  const actionLabels = {
    running: 'mark this setup as Running',
    change_in_progress: 'mark this setup as In Progress',
    change_complete: 'mark this setup as Complete',
    blocked: 'flag this setup for Maintenance',
    save_notes: 'save these notes',
    clear: 'clear this setup'
  };

  const confirmationNeeded = action !== 'save_notes' && action !== 'clear';
  if (confirmationNeeded) {
    const confirmed = window.confirm(
      `Confirm: ${actionLabels[action] || 'apply this action'} for Press ${selected.pressNumber} Slot ${selected.slotIndex + 1}?`
    );

    if (!confirmed) return;
  }

  try {
    isSubmitting = true;
    setDialogBusyState(true);

    if (action === 'clear') {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: session.name,
        setup: {
          partNumber: '',
          qtyRemaining: 0,
          status: 'not_running',
          notes: ''
        }
      });
    } else {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: session.name,
        setup: {
          partNumber: slot.partNumber,
          qtyRemaining: slot.qtyRemaining,
          status: action === 'save_notes' ? slot.status : action,
          notes: dialogNotes.value.trim()
        }
      });
    }

    setupDialog.close();
  } catch (error) {
    console.error('❌ Board action failed:', error);
    alert('Update failed. Please try again.');
  } finally {
    isSubmitting = false;
    setDialogBusyState(false);
  }
}

function filteredPresses() {
  return presses.filter((press) => {
    const areaMatch = areaFilterBoard.value === 'all' || press.area === areaFilterBoard.value;
    const shiftMatch = shiftFilterBoard.value === 'all' || press.shift === shiftFilterBoard.value;
    return areaMatch && shiftMatch;
  });
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribePresses === 'function') {
    unsubscribePresses();
  }
});
