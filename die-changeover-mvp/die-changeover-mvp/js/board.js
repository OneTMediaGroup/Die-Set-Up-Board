import { isDieSetter, isAdmin } from './roles.js';
import { initStore, getSession, setSession } from './store.js';
import { formatTime, formatDateTime, statusLabel } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore } from './firestore-write.js';
import { fetchUsersFromFirestore } from './firestore-users.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { mountUserSwitcher } from './user-switcher.js';

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
let dialogOpenedAt = null;

bootstrapSession();
wireDialog();
startPressWatcher();

mountUserSwitcher({
  selectId: 'userSwitcher',
  labelId: 'currentUserBoard',
  allowedRoles: ['operator', 'dieSetter', 'admin', 'supervisor']
});

async function bootstrapSession() {
  const storedUser = getStoredSessionUser();

  if (storedUser) {
    setSession(storedUser);
    currentUserBoard.textContent = `${storedUser.name} · ${storedUser.role}`;
    return;
  }

  try {
    const users = await fetchUsersFromFirestore();
    const defaultUser =
      users.find((user) => user.role === 'dieSetter') ||
      users.find((user) => user.role === 'operator') ||
      users[0];

    setStoredSessionUser(defaultUser);
    setSession(defaultUser);
    currentUserBoard.textContent = `${defaultUser.name} · ${defaultUser.role}`;
  } catch {
    const fallbackUser = { id: 'u1', name: 'Demo', role: 'operator' };
    setSession(fallbackUser);
    currentUserBoard.textContent = `${fallbackUser.name} · ${fallbackUser.role}`;
  }
}

function isOperator() {
  const session = getSession();
  return session?.role === 'operator';
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

  syncTimeBoard.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  pressGrid.innerHTML = visiblePresses.map((press) => {
    const slots = getSlotsArray(press);

    return `
      <article class="press-row">
        <div class="press-row-header">
          <div>
            <h3>Press ${press.pressNumber}</h3>
            <div class="muted">${press.area} · Shift ${press.shift}</div>
          </div>
          <div class="muted">${slots.filter((s) => s.partNumber).length} active setups</div>
        </div>

        <div class="slot-grid">
          ${slots.map((slot, i) => renderSlot(press, slot, i)).join('')}
        </div>
      </article>
    `;
  }).join('');

  wireActions();
}

function renderSlot(press, slot, slotIndex) {
  const empty = !slot.partNumber;

  let status = empty ? 'no_setup' : slot.status;

  // 👇 NEW STATUS
  if (status === 'ready_for_changeover') {
    status = 'ready_for_changeover';
  }

  const canAct = isDieSetter() || isAdmin();
  const operatorCanAct = isOperator() && !empty;

  return `
    <section class="slot-card ${empty ? 'empty-slot-card' : ''}">
      
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${status}">
          ${empty ? 'No Setup' : statusLabel(slot.status)}
        </span>
      </div>

      <div class="slot-meta">
        <div class="meta-box">
          <span>Part</span>
          <strong>${slot.partNumber || '—'}</strong>
        </div>

        <div class="meta-box">
          <span>Qty</span>
          <strong>${slot.partNumber ? slot.qtyRemaining : '—'}</strong>
        </div>
      </div>

      <div class="slot-note">${slot.notes || 'No notes added.'}</div>

      <div class="muted">
        Last updated by ${slot.lastUpdatedBy || '—'}
      </div>

      <div class="slot-actions">

        ${
          operatorCanAct
            ? `<button class="button full" data-ready data-press-id="${press.id}" data-slot-index="${slotIndex}">
                Ready for Changeover
               </button>`
            : ''
        }

        ${
          canAct
            ? `<button class="button primary full" data-open-setup data-press-id="${press.id}" data-slot-index="${slotIndex}">
                ${empty ? 'View Notes' : 'Open Actions'}
               </button>`
            : ''
        }

      </div>

      <div class="muted">Updated ${formatTime(slot.updatedAt)}</div>

    </section>
  `;
}

function wireActions() {
  // open dialog
  document.querySelectorAll('[data-open-setup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openSetup(btn.dataset.pressId, Number(btn.dataset.slotIndex));
    });
  });

  // 👇 NEW operator action
  document.querySelectorAll('[data-ready]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleReady(btn.dataset.pressId, Number(btn.dataset.slotIndex));
    });
  });
}

async function handleReady(pressId, slotIndex) {
  const session = getSession() || { name: 'Operator' };

  const press = presses.find((p) => p.id === pressId);
  if (!press) return;

  const slot = getSlotsArray(press)[slotIndex];
  if (!slot || !slot.partNumber) return;

  const confirmed = window.confirm(
    `Mark Press ${press.pressNumber} Slot ${slotIndex + 1} as READY FOR CHANGEOVER?`
  );

  if (!confirmed) return;

  try {
    await updateSetupInFirestore({
      pressId,
      slotIndex,
      userName: session.name,
      setup: {
        partNumber: slot.partNumber,
        qtyRemaining: slot.qtyRemaining,
        status: 'ready_for_changeover',
        notes: slot.notes || '',
        previousSetup: slot,
        expectedUpdatedAt: slot.updatedAt || null
      }
    });
  } catch (err) {
    console.error('❌ Ready action failed:', err);
    alert('Failed to mark ready.');
  }
}

function openSetup(pressId, slotIndex) {
  const press = presses.find((p) => p.id === pressId);
  if (!press) return;

  const slot = getSlotsArray(press)[slotIndex];
  if (!slot) return;

  selected = { pressId, slotIndex };

  document.getElementById('dialogTitle').textContent =
    `Press ${press.pressNumber} · Slot ${slotIndex + 1}`;

  dialogNotes.value = slot.notes || '';
  setupDialog.showModal();
}

function wireDialog() {
  setupDialog.addEventListener('close', () => {
    selected = null;
  });

  areaFilterBoard.addEventListener('change', renderBoard);
  shiftFilterBoard.addEventListener('change', renderBoard);
  refreshBoardBtn.addEventListener('click', renderBoard);
}

function filteredPresses() {
  return presses.filter((press) => {
    const areaMatch =
      areaFilterBoard.value === 'all' ||
      press.area === areaFilterBoard.value;

    const shiftMatch =
      shiftFilterBoard.value === 'all' ||
      press.shift === shiftFilterBoard.value;

    return areaMatch && shiftMatch;
  });
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribePresses === 'function') {
    unsubscribePresses();
  }
});
