import { initStore, getPresses, getSession, setSession, upsertSetup, clearSetup } from './store.js';
import { formatTime, formatDateTime, statusLabel } from './utils.js';

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

bootstrapSession();
renderBoard();
wireDialog();

function bootstrapSession() {
  const session = getSession() || { id: 'u1', name: 'Bab S.', role: 'dieSetter' };
  setSession(session);
  currentUserBoard.textContent = `${session.name} · ${session.role}`;
}

function renderBoard() {
  const presses = filteredPresses();
  syncTimeBoard.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  pressGrid.innerHTML = presses.map((press) => `
    <article class="press-row">
      <div class="press-row-header">
        <div>
          <h3>Press ${press.pressNumber}</h3>
          <div class="muted">${press.area} · Shift ${press.shift}</div>
        </div>
        <div class="muted">${press.slots.filter((slot) => slot.partNumber).length} active setups</div>
      </div>
      <div class="slot-grid">
        ${press.slots.map((slot, slotIndex) => renderSlot(press, slot, slotIndex)).join('')}
      </div>
    </article>
  `).join('');

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
        <button class="button primary full" data-open-setup data-press-id="${press.id}" data-slot-index="${slotIndex}">${empty ? 'Add Setup Note' : 'Open Actions'}</button>
      </div>
      <div class="muted">Updated ${formatTime(slot.updatedAt)}</div>
    </section>
  `;
}

function openSetup(pressId, slotIndex) {
  const press = getPresses().find((item) => item.id === pressId);
  const slot = press.slots[slotIndex];
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
    button.addEventListener('click', () => handleDialogAction(button.dataset.action));
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dialogNotes.value = dialogNotes.value ? `${dialogNotes.value}\n${chip.dataset.note}` : chip.dataset.note;
    });
  });

  areaFilterBoard.addEventListener('change', renderBoard);
  shiftFilterBoard.addEventListener('change', renderBoard);
  refreshBoardBtn.addEventListener('click', renderBoard);
}

function handleDialogAction(action) {
  if (!selected) return;
  const session = getSession() || { name: 'Demo User' };

  if (action === 'clear') {
    clearSetup({ pressId: selected.pressId, slotIndex: selected.slotIndex, userName: session.name });
  } else {
    const presses = getPresses();
    const press = presses.find((item) => item.id === selected.pressId);
    const existing = press.slots[selected.slotIndex];
    upsertSetup({
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
  renderBoard();
}

function filteredPresses() {
  return getPresses().filter((press) => {
    const areaMatch = areaFilterBoard.value === 'all' || press.area === areaFilterBoard.value;
    const shiftMatch = shiftFilterBoard.value === 'all' || press.shift === shiftFilterBoard.value;
    return areaMatch && shiftMatch;
  });
}
