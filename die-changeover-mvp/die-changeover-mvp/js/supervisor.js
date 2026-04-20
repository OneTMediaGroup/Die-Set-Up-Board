import { initStore, getSession, setSession } from './store.js';
import { formatDateTime, statusLabel } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import { watchLogsFromFirestore } from './firestore-logs.js';

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

let logs = [];
let unsubscribeLogs = null;

let presses = [];
let unsubscribePresses = null;

bootstrapSession();
wireEvents();
startPressWatcher();
startLogWatcher();

function bootstrapSession() {
  const session = getSession() || { id: 'u2', name: 'Sully T.', role: 'supervisor' };
  setSession(session);
  currentUserSupervisor.textContent = `${session.name} · ${session.role}`;
}

function getSlotsArray(press) {
  if (Array.isArray(press.slots)) return press.slots;
  return Object.values(press.slots || {});
}

function getOrderedPressesForDisplay() {
  const selectedPressId = pressSelect.value;
  if (!selectedPressId) return presses;

  const selectedPress = presses.find((press) => press.id === selectedPressId);
  const otherPresses = presses.filter((press) => press.id !== selectedPressId);

  return selectedPress ? [selectedPress, ...otherPresses] : presses;
}

function startLogWatcher() {
  unsubscribeLogs = watchLogsFromFirestore((liveLogs) => {
    logs = liveLogs;
    render();
  });
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

  const currentSelectedPressId = pressSelect.value || presses[0]?.id || '';
  const currentSelectedSlotIndex = slotSelect.value || '0';

  pressSelect.innerHTML = presses
    .map((press) => `<option value="${press.id}">Press ${press.pressNumber}</option>`)
    .join('');

  if (currentSelectedPressId && presses.some((press) => press.id === currentSelectedPressId)) {
    pressSelect.value = currentSelectedPressId;
  }

  slotSelect.value = currentSelectedSlotIndex;

  const orderedPresses = getOrderedPressesForDisplay();
  const selectedPressId = pressSelect.value;

  supervisorBoard.innerHTML = orderedPresses
    .map((press) => {
      const isSelected = press.id === selectedPressId;
      const selectedClass = isSelected ? ' selected-press-card' : '';
      const selectedBadge = isSelected ? '<span class="status-pill running">Selected</span>' : '';

      return `
        <article class="queue-card${selectedClass}" data-press-card="${press.id}">
          <header>
            <div>
              <strong>Press ${press.pressNumber}</strong>
              <span class="muted">${press.area} · Shift ${press.shift}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              ${selectedBadge}
            </div>
          </header>
          <div class="queue-slots">
            ${getSlotsArray(press)
              .map(
                (slot, index) => `
              <div class="queue-slot">
                <div>
                  <strong>Slot ${index + 1}</strong>
                  <div class="muted">${slot.partNumber || 'No setup'} · ${slot.partNumber ? slot.qtyRemaining : '—'}</div>
                  <div class="muted small">Last updated by: ${slot.lastUpdatedBy || press.lastUpdatedBy || '—'}</div>
                </div>
                <span class="status-pill ${slot.partNumber ? slot.status : 'no_setup'}">${slot.partNumber ? statusLabel(slot.status) : 'No Setup'}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');

  activityFeed.innerHTML = logs
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

  applySelectedPressStyles();
}

function applySelectedPressStyles() {
  supervisorBoard.querySelectorAll('[data-press-card]').forEach((card) => {
    card.style.borderWidth = '1px';
    card.style.borderStyle = 'solid';
    card.style.borderColor = 'rgba(255,255,255,0.08)';
    card.style.boxShadow = 'none';
  });

  const selectedCard = supervisorBoard.querySelector(`[data-press-card="${pressSelect.value}"]`);
  if (!selectedCard) return;

  selectedCard.style.borderWidth = '2px';
  selectedCard.style.borderStyle = 'solid';
  selectedCard.style.borderColor = 'rgba(255,255,255,0.35)';
  selectedCard.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.06)';
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

function validateSetupForm() {
  const partNumber = document.getElementById('partInput').value.trim();
  const qtyValue = Number(document.getElementById('qtyInput').value);

  if (!partNumber) {
    alert('Part number is required.');
    document.getElementById('partInput').focus();
    return null;
  }

  if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
    alert('Quantity must be greater than 0.');
    document.getElementById('qtyInput').focus();
    return null;
  }

  return {
    partNumber,
    qtyRemaining: qtyValue,
    notes: document.getElementById('notesInput').value.trim()
  };
}

function wireEvents() {
  pressSelect.addEventListener('change', () => {
    autofillForm();
    render();
  });

  slotSelect.addEventListener('change', autofillForm);

  setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const session = getSession() || { name: 'Supervisor Demo' };
    const validated = validateSetupForm();
    if (!validated) return;

    try {
      await updateSetupInFirestore({
        pressId: pressSelect.value,
        slotIndex: Number(slotSelect.value),
        userName: session.name,
        setup: {
          partNumber: validated.partNumber,
          qtyRemaining: validated.qtyRemaining,
          status: 'not_running',
          notes: validated.notes
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

  if (typeof unsubscribeLogs === 'function') {
    unsubscribeLogs();
  }
});
