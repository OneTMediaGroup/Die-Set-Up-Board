import { isSupervisor, isAdmin } from './roles.js';
import { initStore, getSession, setSession } from './store.js';
import { formatDateTime, formatTime, statusLabel } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import { watchLogsFromFirestore } from './firestore-logs.js';
import { fetchUsersFromFirestore } from './firestore-users.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';

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

async function bootstrapSession() {
  const storedUser = getStoredSessionUser();

  if (storedUser && (storedUser.role === 'supervisor' || storedUser.role === 'admin')) {
    setSession(storedUser);
    currentUserSupervisor.textContent = `${storedUser.name} · ${storedUser.role}`;
    return;
  }

  try {
    const users = await fetchUsersFromFirestore();
    const defaultUser =
      users.find((user) => user.role === 'supervisor') ||
      users.find((user) => user.role === 'admin') || {
        id: 'u2',
        name: 'Sully T.',
        role: 'supervisor'
      };

    setStoredSessionUser(defaultUser);
    setSession(defaultUser);
    currentUserSupervisor.textContent = `${defaultUser.name} · ${defaultUser.role}`;
  } catch (error) {
    console.error('❌ Failed loading users:', error);

    const fallbackUser = { id: 'u2', name: 'Sully T.', role: 'supervisor' };
    setSession(fallbackUser);
    currentUserSupervisor.textContent = `${fallbackUser.name} · ${fallbackUser.role}`;
  }
}

function getSlotsArray(press) {
  if (Array.isArray(press.slots)) return press.slots;
  return Object.values(press.slots || {});
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

function getSelectedPress() {
  return presses.find((press) => press.id === pressSelect.value) || null;
}

function getFilteredLogs() {
  const selectedPress = getSelectedPress();
  if (!selectedPress) return logs.slice(0, 12);

  const pressIdToken = selectedPress.id.toUpperCase();
  const pressNumberToken = `Press ${selectedPress.pressNumber}`;

  return logs
    .filter((item) => {
      const message = String(item.message || '');
      return message.includes(pressIdToken) || message.includes(pressNumberToken);
    })
    .slice(0, 12);
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

  supervisorBoard.innerHTML = presses
    .map((press) => renderPressRow(press))
    .join('');

  const filteredLogs = getFilteredLogs();

  activityFeed.innerHTML = filteredLogs.length
    ? filteredLogs
        .map(
          (item) => `
      <div class="history-item">
        <strong>${item.user}</strong>
        <div>${item.message}</div>
        <div class="muted">${formatDateTime(item.createdAt)}</div>
      </div>
    `
        )
        .join('')
    : `
      <div class="history-item">
        <strong>No activity yet</strong>
        <div>No recent activity for this press.</div>
      </div>
    `;

  wireQueueSlotClicks();
}

function renderPressRow(press) {
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
        ${slots.map((slot, slotIndex) => renderSupervisorSlot(press, slot, slotIndex)).join('')}
      </div>
    </article>
  `;
}

function renderSupervisorSlot(press, slot, slotIndex) {
  const empty = !slot.partNumber;
  const displayStatus = empty ? 'no_setup' : slot.status;
  const isSelected = press.id === pressSelect.value && String(slotIndex) === String(slotSelect.value);
  const emptyClass = empty ? ' empty-slot-card' : '';

  return `
    <section
      class="slot-card supervisor-slot-pick${isSelected ? ' selected-slot-card' : ''}${emptyClass}"
      data-pick-press="${press.id}"
      data-pick-slot="${slotIndex}"
      style="${isSelected ? 'border:2px solid rgba(255,255,255,0.25); box-shadow:0 0 0 2px rgba(255,255,255,0.05); cursor:pointer;' : 'cursor:pointer;'}"
    >
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">
          ${empty ? 'No Setup' : statusLabel(slot.status)}
        </span>
      </div>

      <div class="slot-meta">
        <div class="meta-box"><span>Part</span><strong>${slot.partNumber || '—'}</strong></div>
        <div class="meta-box"><span>Qty</span><strong>${slot.partNumber ? slot.qtyRemaining : '—'}</strong></div>
      </div>

      <div class="slot-note">${slot.notes || 'No notes added.'}</div>
      <div class="muted">Last updated by ${slot.lastUpdatedBy || press.lastUpdatedBy || '—'}</div>
      <div class="muted">Updated ${slot.updatedAt ? formatTime(slot.updatedAt) : '—'}</div>
    </section>
  `;
}

function wireQueueSlotClicks() {
  supervisorBoard.querySelectorAll('[data-pick-press][data-pick-slot]').forEach((card) => {
    card.addEventListener('click', () => {
      pressSelect.value = card.dataset.pickPress;
      slotSelect.value = card.dataset.pickSlot;
      autofillForm();
      render();

      if (setupForm && (isSupervisor() || isAdmin())) {
        setupForm.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

function autofillForm() {
  const press = presses.find((p) => p.id === pressSelect.value);
  if (!press) return;

  const slots = getSlotsArray(press);
  const slot = slots[Number(slotSelect.value)];
  if (!slot) return;

  const partInput = document.getElementById('partInput');
  const qtyInput = document.getElementById('qtyInput');
  const notesInput = document.getElementById('notesInput');

  if (partInput) partInput.value = slot.partNumber || '';
  if (qtyInput) qtyInput.value = slot.qtyRemaining || '';
  if (notesInput) notesInput.value = slot.notes || '';
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

  slotSelect.addEventListener('change', () => {
    autofillForm();
    render();
  });

  if (isSupervisor() || isAdmin()) {
    setupForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const session = getSession() || { name: 'Supervisor Demo' };
      const validated = validateSetupForm();
      if (!validated) return;

      const press = presses.find((p) => p.id === pressSelect.value);
      const currentSlot = press ? getSlotsArray(press)[Number(slotSelect.value)] : null;

      try {
        await updateSetupInFirestore({
          pressId: pressSelect.value,
          slotIndex: Number(slotSelect.value),
          userName: session.name,
          setup: {
            partNumber: validated.partNumber,
            qtyRemaining: validated.qtyRemaining,
            status: 'not_running',
            notes: validated.notes,
            previousSetup: currentSlot || null,
            expectedUpdatedAt: currentSlot?.updatedAt || null
          }
        });

        autofillForm();
      } catch (error) {
        if (error?.code === 'slot-conflict') {
          alert(
            `This slot was updated by ${error.lastUpdatedBy || 'another user'} before your save.\n\nPlease review the latest data and try again.`
          );
          return;
        }

        console.error('❌ Supervisor submit failed:', error);
      }
    });
  } else {
    if (setupForm) {
      setupForm.style.display = 'none';
    }
  }

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
