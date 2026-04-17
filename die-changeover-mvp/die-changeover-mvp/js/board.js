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

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    renderBoard();
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
          ${empty ? 'Add Setup Note' : 'Open Actions'}
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

  document.getElementById('dialogTitle').textContent = `Press ${press.pressNumber} · Slot ${slotIndex + 1}`;
  document.getElementById('dialogSubtitle').textContent = `${press.area} · Shift ${press.shift}`;
  document.getElementById('dialogPart').textContent = slot.partNumber || '—';
  document.getElementById('dialogQty').textContent = slot.partNumber ? String(slot.qtyRemaining) : '—';
  document.getElementById('dialogStatus').textContent = slot.partNumber ? statusLabel(slot.status) : 'No setup';
  document.getElementById('dialogUpdated').textContent = formatDateTime(slot.updatedAt);
  dialogNotes.value = slot.notes || '';
  setupDialog.showModal();
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
}

async function handleDialogAction(action) {
  if (!selected) return;

  const session = getSession() || { name: 'Demo User' };
  const press = presses.find((item) => item.id === selected.pressId);
  if (!press) return;

  const slots = getSlotsArray(press);
  const existing = slots[selected.slotIndex];
  if (!existing) return;

  try {
    if (action === 'clear') {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: session.name,
        setup: {
          partNumber: '',
          qtyRemaining: 0,
          status: 'not_running',
          notes: dialogNotes.value.trim()
        }
      });
    } else {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: session.name,
        setup: {
          partNumber: existing.partNumber,
          qtyRemaining: existing.qtyRemaining,
          status: action === 'save_notes' ? existing.status : action,
          notes: dialogNotes.value.trim()
        }
      });
    }

    setupDialog.close();
  } catch (error) {
    console.error('❌ Board action failed:', error);
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
