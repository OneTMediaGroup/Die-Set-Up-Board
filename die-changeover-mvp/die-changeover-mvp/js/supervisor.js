import { initStore, getLogs, getSession, setSession } from './store.js';
import { formatDateTime, statusLabel } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';

initStore();

const currentUserSupervisor = document.getElementById('currentUserSupervisor');
const pressCount = document.getElementById('pressCount');
const setupCount = document.getElementById('setupCount');
const pressSelect = document.getElementById('pressSelect');
const slotSelect = document.getElementById('slotSelect');
const setupForm = document.getElementById('setupForm');
const prefillBtn = document.getElementById('prefillBtn');
const activityFeed = document.getElementById('activityFeed');
const supervisorBoard = document.getElementById('supervisorBoard');
const refreshSupervisorBtn = document.getElementById('refreshSupervisorBtn');

let presses = [];
let unsubscribePresses = null;

bootstrapSession();
wireEvents();
startPressWatcher();

function bootstrapSession() {
  const session = getSession() || { id: 'u2', name: 'Sully T.', role: 'supervisor' };
  setSession(session);
  currentUserSupervisor.textContent = `${session.name} · ${session.role}`;
}

function getSlotsArray(press) {
  if (Array.isArray(press.slots)) return press.slots;
  return Object.values(press.slots || {});
}

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    render();
    autofillForm();
  });
}

function render() {
  pressCount.textContent = String(presses.length);
  setupCount.textContent = String(
    presses.flatMap((press) => getSlotsArray(press)).filter((slot) => slot.partNumber).length
  );

  const currentSelectedPressId = pressSelect.value;
  const currentSelectedSlotIndex = slotSelect.value || '0';

  pressSelect.innerHTML = presses
    .map((press) => `<option value="${press.id}">Press ${press.pressNumber}</option>`)
    .join('');

  if (currentSelectedPressId && presses.some((press) => press.id === currentSelectedPressId)) {
    pressSelect.value = currentSelectedPressId;
  }

  slotSelect.value = currentSelectedSlotIndex;

  supervisorBoard.innerHTML = presses
    .map(
      (press) => `
    <article class="queue-card">
      <header>
        <strong>Press ${press.pressNumber}</strong>
        <span class="muted">${press.area} · Shift ${press.shift}</span>
      </header>
      <div class="queue-slots">
        ${getSlotsArray(press)
          .map(
            (slot, index) => `
          <div class="queue-slot">
            <div>
              <strong>Slot ${index + 1}</strong>
              <div class="muted">${slot.partNumber || 'No setup'} · ${slot.partNumber ? slot.qtyRemaining : '—'}</div>
            </div>
            <span class="status-pill ${slot.partNumber ? slot.status : 'no_setup'}">${slot.partNumber ? statusLabel(slot.status) : 'No Setup'}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </article>
  `
    )
    .join('');

  activityFeed.innerHTML = getLogs()
    .slice(0, 12)
    .map(
      (item) => `
    <div class="history-item">
      <strong>${item.user}</strong>
      <div>${item.message}</div>
      <div class="muted">${formatDateTime(item.createdAt)}</div>
    </div>
  `
    )
    .join('');
}

function autofillForm() {
  const press = presses.find((p) => p.id === pressSelect.value);
  if (!press) return;

  const slots = getSlotsArray(press);
  const slot = slots[Number(slotSelect.value)];
  if (!slot) return;

  document.getElementById('partInput').value = slot.partNumber || '';
  document.getElementById('qtyInput').value = slot.qtyRemaining || '';
  document.getElementById('notesInput').value = slot.notes || '';
}

function wireEvents() {
  pressSelect.addEventListener('change', autofillForm);
  slotSelect.addEventListener('change', autofillForm);

  setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const session = getSession() || { name: 'Supervisor Demo' };

    try {
      await updateSetupInFirestore({
        pressId: pressSelect.value,
        slotIndex: Number(slotSelect.value),
        userName: session.name,
        setup: {
          partNumber: document.getElementById('partInput').value.trim(),
          qtyRemaining: Number(document.getElementById('qtyInput').value),
          status: 'not_running',
          notes: document.getElementById('notesInput').value.trim()
        }
      });

      autofillForm();
    } catch (error) {
      console.error('❌ Supervisor submit failed:', error);
    }
  });

  if (prefillBtn) {
    prefillBtn.style.display = 'none';
  }

  refreshSupervisorBtn.addEventListener('click', render);
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribePresses === 'function') {
    unsubscribePresses();
  }
});
