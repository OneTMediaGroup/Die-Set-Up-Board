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
  allowedRoles: ['dieSetter', 'admin', 'supervisor']
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
      users.find((user) => user.role === 'admin') ||
      users.find((user) => user.role === 'supervisor') ||
      users[0];

    if (defaultUser) {
      setStoredSessionUser(defaultUser);
      setSession(defaultUser);
      currentUserBoard.textContent = `${defaultUser.name} · ${defaultUser.role}`;
    } else {
      currentUserBoard.textContent = 'Public touch screen';
    }
  } catch {
    currentUserBoard.textContent = 'Public touch screen';
  }
}

function getActionUserName() {
  const session = getSession();
  if (session?.name && (isDieSetter() || isAdmin())) {
    return session.name;
  }
  return 'Operator Station';
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

function ensureDialogNotice() {
  let notice = document.getElementById('dialogStaleNotice');
  if (notice) return notice;

  notice = document.createElement('div');
  notice.id = 'dialogStaleNotice';
  notice.className = 'muted';
  notice.style.display = 'none';
  notice.style.marginTop = '8px';
  notice.style.padding = '10px 12px';
  notice.style.border = '1px solid rgba(255,255,255,0.15)';
  notice.style.borderRadius = '10px';
  notice.style.background = 'rgba(255,255,255,0.05)';
  notice.style.color = '#ffd7a8';

  const subtitle = document.getElementById('dialogSubtitle');
  if (subtitle && subtitle.parentElement) {
    subtitle.parentElement.insertAdjacentElement('afterend', notice);
  }

  return notice;
}

function showDialogNotice(message) {
  const notice = ensureDialogNotice();
  notice.textContent = message;
  notice.style.display = 'block';
}

function hideDialogNotice() {
  const notice = ensureDialogNotice();
  notice.textContent = '';
  notice.style.display = 'none';
}

function startPressWatcher() {
  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses.map((press) => ({
      ...press,
      isLocked: Boolean(press.isLocked)
    }));
    renderBoard();

    if (setupDialog.open && selected) {
      refreshOpenDialog();
    }
  });
}

function renderBoard() {
  const visiblePresses = filteredPresses();

  syncTimeBoard.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  syncAreaFilterOptions();

  const grouped = {};

  visiblePresses.forEach((press) => {
    const areaLabel = press.areaId && press.areaName ? press.areaName : 'Unassigned';
    const key = press.areaId && press.areaName ? press.areaId : 'unassigned';

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(press);
  });

  const sortedAreaKeys = Object.keys(grouped).sort((a, b) => {
    const aLabel = grouped[a][0]?.areaName || 'Unassigned';
    const bLabel = grouped[b][0]?.areaName || 'Unassigned';
    return aLabel.localeCompare(bLabel);
  });

  pressGrid.innerHTML = sortedAreaKeys.map((areaKey) => {
    const pressesInArea = grouped[areaKey];

    const areaLabel =
      areaKey === 'unassigned'
        ? 'Unassigned'
        : pressesInArea[0]?.areaName || 'Unassigned';

    const areaColor = pressesInArea[0]?.areaColor || '#444';

    const sortedPresses = [...pressesInArea].sort(
      (a, b) => Number(a.pressNumber || 0) - Number(b.pressNumber || 0)
    );

    return `
      <section class="area-block">
        <h2 style="margin-bottom:12px; border-left:8px solid ${areaColor}; padding-left:12px;">
          ${areaLabel}
        </h2>

        ${sortedPresses.map((press) => {
          const slots = getSlotsArray(press);

          return `
            <article class="press-row">
              <div class="press-row-header">
                <div>
                  <h3>${press.equipmentName || `Press ${press.pressNumber}`}</h3>
                  <div class="muted">${press.area || 'No work cell'} · Shift ${press.shift}${press.isLocked ? ` · Locked by ${press.lockedBy || 'Admin'}` : ''}</div>
                </div>
                <div class="muted">${slots.filter((slot) => slot.partNumber).length} active setups</div>
              </div>
              <div class="slot-grid">
                ${slots.map((slot, slotIndex) => renderSlot(press, slot, slotIndex)).join('')}
              </div>
            </article>
          `;
        }).join('')}
      </section>
    `;
  }).join('');

  pressGrid.querySelectorAll('[data-open-setup]').forEach((button) => {
    button.addEventListener('click', () => openSetup(button.dataset.pressId, Number(button.dataset.slotIndex)));
  });

  pressGrid.querySelectorAll('[data-quick-complete]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await handleQuickComplete(button.dataset.pressId, Number(button.dataset.slotIndex));
    });
  });

  pressGrid.querySelectorAll('[data-ready]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await handleReadyForChangeover(button.dataset.pressId, Number(button.dataset.slotIndex));
    });
  });
}

function renderSlot(press, slot, slotIndex) {
  const areaColor = press.areaColor || '#444';
  const empty = !slot.partNumber;
  const displayStatus = empty ? 'no_setup' : slot.status;
  const canAct = (isDieSetter() || isAdmin()) && !press.isLocked;
  const canPublicReady = !press.isLocked && !empty && slot.status !== 'ready_for_changeover';
  const showQuickComplete = canAct && !empty && slot.status !== 'change_complete';
  const emptyClass = empty ? ' empty-slot-card' : '';
  const lockedBadge = press.isLocked ? `<div class="muted" style="margin-bottom:8px;">🔒 Press locked</div>` : '';

  return `
    <section class="slot-card${emptyClass}" style="border-left:6px solid ${areaColor};">
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(slot.status)}</span>
      </div>

      <div class="slot-meta">
        <div class="meta-box"><span>Part</span><strong>${slot.partNumber || '—'}</strong></div>
        <div class="meta-box"><span>Qty</span><strong>${slot.partNumber ? slot.qtyRemaining : '—'}</strong></div>
      </div>

      <div class="slot-note">${slot.notes || 'No notes added.'}</div>
      <div class="muted">Last updated by ${slot.lastUpdatedBy || press.lastUpdatedBy || '—'}</div>
      ${lockedBadge}

      <div class="slot-actions">
        ${
          canPublicReady
            ? `<button class="button full" data-ready data-press-id="${press.id}" data-slot-index="${slotIndex}">Ready for Changeover</button>`
            : ''
        }
        ${
          showQuickComplete
            ? `<button class="button full" data-quick-complete data-press-id="${press.id}" data-slot-index="${slotIndex}">Quick Complete</button>`
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

async function handleReadyForChangeover(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press || press.isLocked) {
    alert('This press is locked by Admin.');
    return;
  }

  const slots = getSlotsArray(press);
  const slot = slots[slotIndex];
  if (!slot || !slot.partNumber) return;
  if (slot.status === 'ready_for_changeover') return;

  const confirmed = window.confirm(
    `Mark ${press.equipmentName || `Press ${press.pressNumber}`} Slot ${slotIndex + 1} as READY FOR CHANGEOVER?`
  );

  if (!confirmed) return;

  try {
    await updateSetupInFirestore({
      pressId,
      slotIndex,
      userName: getActionUserName(),
      setup: {
        partNumber: slot.partNumber,
        qtyRemaining: slot.qtyRemaining,
        status: 'ready_for_changeover',
        notes: slot.notes || '',
        previousSetup: slot,
        expectedUpdatedAt: slot.updatedAt || null
      }
    });
  } catch (error) {
    if (error?.code === 'slot-conflict') {
      alert(
        `This slot was updated by ${error.lastUpdatedBy || 'another user'} before marking ready.\n\nPlease review the latest data and try again.`
      );
      return;
    }

    console.error('❌ Ready for changeover failed:', error);
    alert('Ready for Changeover failed. Please try again.');
  }
}

async function handleQuickComplete(pressId, slotIndex) {
  const session = getSession() || { name: 'Demo User' };
  const press = presses.find((item) => item.id === pressId);
  if (!press || press.isLocked) {
    alert('This press is locked by Admin.');
    return;
  }

  const slots = getSlotsArray(press);
  const slot = slots[slotIndex];
  if (!slot || !slot.partNumber) return;
  if (slot.status === 'change_complete') return;

  const confirmed = window.confirm(
    `Mark ${press.equipmentName || `Press ${press.pressNumber}`} Slot ${slotIndex + 1} as Complete?\n\nPart: ${slot.partNumber}`
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
        status: 'change_complete',
        notes: slot.notes || '',
        previousSetup: slot,
        expectedUpdatedAt: slot.updatedAt || null
      }
    });
  } catch (error) {
    if (error?.code === 'slot-conflict') {
      alert(
        `This slot was updated by ${error.lastUpdatedBy || 'another user'} before Quick Complete.\n\nPlease review the latest data and try again.`
      );
      return;
    }

    console.error('❌ Quick complete failed:', error);
    alert('Quick Complete failed. Please try again.');
  }
}

function openSetup(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  if (press.isLocked && !isAdmin()) {
    alert('This press is locked by Admin.');
    return;
  }

  const slots = getSlotsArray(press);
  const slot = slots[slotIndex];
  if (!slot) return;

  selected = { pressId, slotIndex, pressNumber: press.pressNumber };
  dialogOpenedAt = slot.updatedAt || null;
  hideDialogNotice();
  fillDialog(press, slot, slotIndex);
  setupDialog.showModal();
}

function refreshOpenDialog() {
  const data = getSelectedPressAndSlot();
  if (!data) return;

  const { press, slot } = data;
  fillDialog(press, slot, selected.slotIndex);

  if (dialogOpenedAt && slot.updatedAt && slot.updatedAt !== dialogOpenedAt) {
    showDialogNotice(
      `Updated by ${slot.lastUpdatedBy || 'another user'} at ${formatDateTime(slot.updatedAt)}`
    );
  }
}

function fillDialog(press, slot, slotIndex) {
  const empty = !slot.partNumber;

  document.getElementById('dialogTitle').textContent = `${press.equipmentName || `Press ${press.pressNumber}`} · Slot ${slotIndex + 1}`;
  document.getElementById('dialogSubtitle').textContent = `${press.area} · Shift ${press.shift}${press.isLocked ? ' · LOCKED' : ''}`;
  document.getElementById('dialogPart').textContent = slot.partNumber || '—';
  document.getElementById('dialogQty').textContent = slot.partNumber ? String(slot.qtyRemaining) : '—';
  document.getElementById('dialogStatus').textContent = slot.partNumber ? statusLabel(slot.status) : 'No setup';
  document.getElementById('dialogUpdated').textContent = formatDateTime(slot.updatedAt);
  dialogNotes.value = slot.notes || '';

  updateDialogActionState(empty || press.isLocked);
}

function updateDialogActionState(empty) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = button.dataset.action;
    const isNotesOnly = action === 'save_notes';

    if (empty) {
      button.disabled = !isNotesOnly;
      button.title = isNotesOnly ? '' : 'This slot cannot be changed right now.';
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
    dialogOpenedAt = null;
    hideDialogNotice();
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
    const empty = !data || !data.slot.partNumber || data.press.isLocked;

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

  const { slot, press } = data;
  const empty = !slot.partNumber;

  if (press.isLocked && !isAdmin()) {
    alert('This press is locked by Admin.');
    return;
  }

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
          notes: '',
          previousSetup: slot,
          expectedUpdatedAt: slot.updatedAt || null
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
          notes: dialogNotes.value.trim(),
          previousSetup: slot,
          expectedUpdatedAt: slot.updatedAt || null
        }
      });
    }

    setupDialog.close();
  } catch (error) {
    if (error?.code === 'slot-conflict') {
      alert(
        `This slot was updated by ${error.lastUpdatedBy || 'another user'} before your change.\n\nPlease review the latest data and try again.`
      );
      return;
    }

    console.error('❌ Board action failed:', error);
    alert('Update failed. Please try again.');
  } finally {
    isSubmitting = false;
    setDialogBusyState(false);
  }
}
function syncAreaFilterOptions() {
  if (!areaFilterBoard) return;

  const currentValue = areaFilterBoard.value || 'all';

  const areaNames = [...new Set(
    presses
      .filter((press) => press.areaId && press.areaName)
      .map((press) => press.areaName)
  )].sort();

  areaFilterBoard.innerHTML = `
    <option value="all">All</option>
    <option value="unassigned">Unassigned</option>
    ${areaNames.map((name) => `<option value="${name}">${name}</option>`).join('')}
  `;

  if (currentValue === 'all' || currentValue === 'unassigned' || areaNames.includes(currentValue)) {
    areaFilterBoard.value = currentValue;
  } else {
    areaFilterBoard.value = 'all';
  }
}


function filteredPresses() {
  return presses.filter((press) => {
    const pressArea = press.areaId && press.areaName ? press.areaName : 'unassigned';

    const areaMatch =
      areaFilterBoard.value === 'all' ||
      areaFilterBoard.value === pressArea;

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
