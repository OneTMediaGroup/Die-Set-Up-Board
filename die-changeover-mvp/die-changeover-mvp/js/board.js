import { isAdmin } from './roles.js';
import { initStore, getSession, setSession } from './store.js';
import { formatTime, formatDateTime, statusLabel, normalizedSlotStatus } from './utils.js';
import { watchPressesFromFirestore } from './firestore-presses.js';
import { updateSetupInFirestore, completeAndShiftSetupInFirestore } from './firestore-write.js';
import { fetchUsersFromFirestore } from './firestore-users.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';

initStore();

const pressGrid = document.getElementById('pressGrid');
const syncTimeBoard = document.getElementById('syncTimeBoard');
const setupDialog = document.getElementById('setupDialog');
const areaFilterBoard = document.getElementById('areaFilterBoard');
const refreshBoardBtn = document.getElementById('refreshBoardBtn');
const dialogNotes = document.getElementById('dialogNotes');

let selected = null;
let presses = [];
let dieSetters = [];
let pendingComplete = null;
let unsubscribePresses = null;
let isSubmitting = false;
let dialogOpenedAt = null;
let expandedPressIds = new Set();

bootstrapSession();
ensureLoginModal();
wireLoginModal();
wireDialog();
loadDieSetters();
startPressWatcher();

function matchesUserCode(user, enteredValue) {
  const value = String(enteredValue || '').trim();
  if (!value) return false;

  return [
    user.employeeId,
    user.pin,
    user.badgeCode,
    user.badge,
    user.scanCode,
    user.barcode
  ].some((item) => String(item || '').trim() === value);
}





async function loadDieSetters() {
  try {
    const users = await fetchUsersFromFirestore();

    dieSetters = users.filter((user) => {
      const active = user.status === 'active' || user.isActive === true;
      return ['operator', 'dieSetter', 'supervisor', 'admin'].includes(user.role) && active;
    });

    renderDieSetterOptions();
  } catch (error) {
    console.error('❌ Failed to load Authorized Staff:', error);
    dieSetters = [];
    renderDieSetterOptions();
  }
}

function renderDieSetterOptions() {
  const select = document.getElementById('dieSetterLoginUser');
  if (!select) return;

  if (!dieSetters.length) {
    select.innerHTML = `<option value="">No active users found</option>`;
    return;
  }

  select.innerHTML = dieSetters
    .map((user) => `<option value="${user.id}">${user.name}</option>`)
    .join('');
}

function ensureLoginModal() {
  if (document.getElementById('dieSetterLoginModal')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="dieSetterLoginModal" class="modal hidden">
      <div class="modal-content">
        <h3>Complete + Shift</h3>
        <p class="muted" style="margin-bottom:14px;">Confirm who completed this task.</p>

        <label class="muted">User</label>
        <select id="dieSetterLoginUser" style="margin-top:6px; width:100%;"></select>

        <label class="muted" style="margin-top:12px; display:block;">PIN</label>
        <input id="dieSetterLoginPin" type="password" inputmode="numeric" placeholder="Enter PIN" style="margin-top:6px; width:100%;" />

        <div id="dieSetterLoginError" class="error-text" style="display:none;"></div>

        <div class="modal-actions">
          <button id="dieSetterLoginCancel" class="button">Cancel</button>
          <button id="dieSetterLoginConfirm" class="button primary">Complete + Shift</button>
        </div>
      </div>
    </div>
  `);
}

function wireLoginModal() {
  document.getElementById('dieSetterLoginCancel')?.addEventListener('click', closeDieSetterLogin);
  document.getElementById('dieSetterLoginConfirm')?.addEventListener('click', confirmDieSetterLogin);

  document.getElementById('dieSetterLoginPin')?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') await confirmDieSetterLogin();
  });
}

function openDieSetterLogin(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  const slot = getSlotsArray(press)[slotIndex];
  if (!slot || !slot.partNumber) return;

  pendingComplete = {
    pressId,
    slotIndex,
    expectedUpdatedAt: slot.updatedAt || null
  };

  const modal = document.getElementById('dieSetterLoginModal');
  const pinInput = document.getElementById('dieSetterLoginPin');
  const error = document.getElementById('dieSetterLoginError');

  if (pinInput) pinInput.value = '';
  if (error) {
    error.textContent = '';
    error.style.display = 'none';
  }

  renderDieSetterOptions();
  modal?.classList.remove('hidden');
  setTimeout(() => pinInput?.focus(), 100);
}

function closeDieSetterLogin() {
  document.getElementById('dieSetterLoginModal')?.classList.add('hidden');
  pendingComplete = null;
}

function showLoginError(message) {
  const error = document.getElementById('dieSetterLoginError');
  if (!error) return;
  error.textContent = message;
  error.style.display = 'block';
}

async function confirmDieSetterLogin() {
  if (!pendingComplete) return;

  const userId = document.getElementById('dieSetterLoginUser')?.value || '';
  const pinInput = document.getElementById('dieSetterLoginPin');
  const pin = employeeId;
  const confirmBtn = document.getElementById('dieSetterLoginConfirm');
  const user = dieSetters.find((item) => item.id === userId);

  if (!user) {
    showLoginError('Select a user.');
    return;
  }

  if (!matchesUserCode(user, pin)) {
    showLoginError('Invalid PIN.');
    pinInput?.focus();
    return;
  }

  try {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Completing...';
    }

    await completeAndShiftSetupInFirestore({
      pressId: pendingComplete.pressId,
      slotIndex: pendingComplete.slotIndex,
      userName: user.name,
      setup: {
        expectedUpdatedAt: pendingComplete.expectedUpdatedAt
      }
    });

    closeDieSetterLogin();
  } catch (error) {
    if (error?.code === 'slot-conflict') {
      showLoginError(`This slot was updated by ${error.lastUpdatedBy || 'another user'}. Refresh and try again.`);
      return;
    }

    console.error('❌ Complete + Shift failed:', error);
    showLoginError('Complete + Shift failed. Try again.');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Complete + Shift';
    }
  }
}

function ensureReadyModal() {
  if (document.getElementById('readyLoginModal')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="readyLoginModal" class="modal hidden">
      <div class="modal-content">
        <h3>Ready for Changeover</h3>
        <p class="muted" style="margin-bottom:14px;">Enter Employee ID.</p>

        <input id="readyEmployeeId" type="text" placeholder="Scan badge or enter PIN" autocomplete="off" style="width:100%;" />
        <div id="readyEmployeeName" class="muted" style="margin-top:8px;"></div>

        <div class="modal-actions">
          <button id="readyCancel" class="button">Cancel</button>
          <button id="readyConfirm" class="button primary">Confirm Ready</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById('readyCancel').onclick = () => {
    document.getElementById('readyLoginModal').classList.add('hidden');
  };

  document.getElementById('readyEmployeeId').addEventListener('input', (e) => {
    const val = e.target.value;
    const user = dieSetters.find((u) => matchesUserCode(u, val));

    document.getElementById('readyEmployeeName').textContent =
      user ? `Confirm: ${user.name}` : '';
  });
}



async function bootstrapSession() {
  const storedUser = getStoredSessionUser();

  if (storedUser) {
    setSession(storedUser);
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
    }
  } catch (error) {
    console.error('❌ Failed to bootstrap board session:', error);
  }
}

function getActionUserName() {
  return 'Operator Station';
}

function getSlotsArray(press) {
  const raw = Array.isArray(press.slots) ? press.slots : Object.values(press.slots || {});

  const slots = raw.slice(0, 4).map((slot, index) => {
    const hasPart = Boolean(slot?.partNumber);
    return {
      partNumber: slot?.partNumber || '',
      qtyRemaining: Number(slot?.qtyRemaining || 0),
      status: hasPart ? normalizedSlotStatus(slot?.status, index, true) : (index === 0 ? 'current' : 'next'),
      notes: slot?.notes || '',
      updatedAt: slot?.updatedAt || '',
      lastUpdatedBy: slot?.lastUpdatedBy || ''
    };
  });

  while (slots.length < 4) {
    slots.push({
      partNumber: '',
      qtyRemaining: 0,
      status: slots.length === 0 ? 'current' : 'next',
      notes: '',
      updatedAt: '',
      lastUpdatedBy: ''
    });
  }

  return slots;
}

function getSelectedPressAndSlot() {
  if (!selected) return null;

  const press = presses.find((item) => item.id === selected.pressId);
  if (!press) return null;

  const slot = getSlotsArray(press)[selected.slotIndex];
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
  if (subtitle?.parentElement) {
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

    if (setupDialog?.open && selected) {
      refreshOpenDialog();
    }
  });
}

function renderBoard() {
  const visiblePresses = filteredPresses();

  if (syncTimeBoard) {
    syncTimeBoard.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  syncAreaFilterOptions();

  const grouped = {};

  visiblePresses.forEach((press) => {
    const key = press.areaId && press.areaName ? press.areaId : 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(press);
  });

  const sortedAreaKeys = Object.keys(grouped).sort((a, b) => {
    const aLabel = grouped[a][0]?.areaName || 'Unassigned';
    const bLabel = grouped[b][0]?.areaName || 'Unassigned';
    return aLabel.localeCompare(bLabel);
  });

  if (!sortedAreaKeys.length) {
    pressGrid.innerHTML = `<div class="display-empty-state">No equipment found.</div>`;
    return;
  }

  pressGrid.innerHTML = sortedAreaKeys.map((areaKey) => {
    const pressesInArea = grouped[areaKey];

    const label =
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
          ${label}
        </h2>

        ${sortedPresses.map(renderPressCard).join('')}
      </section>
    `;
  }).join('');

  wireBoardActions();
}

function renderPressCard(press) {
  const slots = getSlotsArray(press);
  const activeCount = slots.filter((slot) => slot.partNumber).length;
  const isExpanded = expandedPressIds.has(press.id);

  return `
    <article class="press-row">
      <button class="press-row-header die-board-press-toggle" data-toggle-press="${press.id}" type="button">
        <div>
          <h3>${isExpanded ? '⌄' : '›'} ${press.equipmentName || `Press ${press.pressNumber}`}</h3>
          <div class="muted">
            ${press.areaName || press.area || 'No work cell'}${press.isLocked ? ` · Locked by ${press.lockedBy || 'Admin'}` : ''}
          </div>
        </div>
        <div class="muted">${activeCount} active setup${activeCount === 1 ? '' : 's'}</div>
      </button>

      ${isExpanded ? `
        <div class="slot-grid">
          ${slots.map((slot, slotIndex) => renderSlot(press, slot, slotIndex)).join('')}
        </div>
      ` : ''}
    </article>
  `;
}

function wireBoardActions() {
  pressGrid.querySelectorAll('[data-toggle-press]').forEach((button) => {
    button.addEventListener('click', () => {
      const pressId = button.dataset.togglePress;
      if (!pressId) return;

      if (expandedPressIds.has(pressId)) expandedPressIds.delete(pressId);
      else expandedPressIds.add(pressId);

      renderBoard();
    });
  });

  pressGrid.querySelectorAll('[data-open-setup]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openSetup(button.dataset.pressId, Number(button.dataset.slotIndex));
    });
  });

  pressGrid.querySelectorAll('[data-complete-shift]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openDieSetterLogin(button.dataset.pressId, Number(button.dataset.slotIndex));
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
  const displayStatus = empty ? 'no_setup' : normalizedSlotStatus(slot.status, slotIndex, true);
  const canMarkReady = !press.isLocked && !empty && slotIndex === 0 && displayStatus !== 'ready';
  const showCompleteShift = !press.isLocked && !empty && slotIndex === 0 && displayStatus === 'ready';
  const emptyClass = empty ? ' empty-slot-card' : '';
  const readyClass = displayStatus === 'ready' ? ' ready-slot' : '';
  const lockedBadge = press.isLocked ? `<div class="muted" style="margin-bottom:8px;">🔒 Press locked</div>` : '';

  return `
    <section class="slot-card${emptyClass}${readyClass}" style="border-left:6px solid ${displayStatus === 'ready' ? '#22c55e' : areaColor};">
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(displayStatus)}</span>
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
          canMarkReady
            ? `<button class="button full" data-ready data-press-id="${press.id}" data-slot-index="${slotIndex}">Ready for Changeover</button>`
            : ''
        }
        ${
          showCompleteShift
            ? `<button class="button success full" data-complete-shift data-press-id="${press.id}" data-slot-index="${slotIndex}">Complete + Shift</button>`
            : ''
        }
        ${
          empty
            ? `<button class="button primary full" data-open-setup data-press-id="${press.id}" data-slot-index="${slotIndex}">View Notes</button>`
            : ''
        }
      </div>

      <div class="muted">Updated ${formatTime(slot.updatedAt)}</div>
    </section>
  `;
}
function findUserByScan(value) {
  const clean = String(value).trim();

  return dieSetters.find(u =>
    String(u.employeeId || '') === clean ||
    String(u.badgeCode || '') === clean
  );
}


async function handleReadyForChangeover(pressId, slotIndex) {
  ensureReadyModal();

  const modal = document.getElementById('readyLoginModal');
  const input = document.getElementById('readyEmployeeId');
  const nameLabel = document.getElementById('readyEmployeeName');

  modal.classList.remove('hidden');

  input.value = '';
  nameLabel.textContent = '';

  // 🔥 AUTO FOCUS
  setTimeout(() => input.focus(), 100);

  let lastKeyTime = 0;
  let scanBuffer = '';

  input.onkeydown = async (e) => {
    const now = Date.now();

    // detect fast input (scanner)
    if (now - lastKeyTime < 50) {
      scanBuffer += e.key;
    } else {
      scanBuffer = e.key;
    }

    lastKeyTime = now;

    // ENTER = submit (scanner or human)
    if (e.key === 'Enter') {
      await processReadyScan();
    }
  };

  input.oninput = () => {
    const user = findUserByScan(input.value);
    nameLabel.textContent = user ? `Confirm: ${user.name}` : '';
  };

  async function processReadyScan() {
    const entered = input.value.trim();
    const user = findUserByScan(entered);

    if (!user) {
      alert('Invalid scan');
      input.value = '';
      nameLabel.textContent = '';
      input.focus();
      return;
    }

    const press = presses.find(p => p.id === pressId);
    const slot = getSlotsArray(press)[slotIndex];

    try {
      await updateSetupInFirestore({
        pressId,
        slotIndex,
        userName: user.name,
        setup: {
          partNumber: slot.partNumber,
          qtyRemaining: slot.qtyRemaining,
          status: 'ready',
          notes: slot.notes || '',
          previousSetup: slot,
          expectedUpdatedAt: slot.updatedAt || null
        }
      });

      modal.classList.add('hidden');
    } catch (error) {
      console.error(error);
      alert('Failed to mark ready');
    }
  }
}

function openSetup(pressId, slotIndex) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  if (press.isLocked && !isAdmin()) {
    alert('This press is locked by Admin.');
    return;
  }

  const slot = getSlotsArray(press)[slotIndex];
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
    showDialogNotice(`Updated by ${slot.lastUpdatedBy || 'another user'} at ${formatDateTime(slot.updatedAt)}`);
  }
}

function fillDialog(press, slot, slotIndex) {
  const empty = !slot.partNumber;

  document.getElementById('dialogTitle').textContent = `${press.equipmentName || `Press ${press.pressNumber}`} · Slot ${slotIndex + 1}`;
  document.getElementById('dialogSubtitle').textContent =
    `${press.areaName || press.area || 'No work cell'}${press.isLocked ? ' · LOCKED' : ''}`;
  document.getElementById('dialogPart').textContent = slot.partNumber || '—';
  document.getElementById('dialogQty').textContent = slot.partNumber ? String(slot.qtyRemaining) : '—';
  document.getElementById('dialogStatus').textContent = slot.partNumber ? statusLabel(normalizedSlotStatus(slot.status, slotIndex, true)) : 'No setup';
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

  areaFilterBoard?.addEventListener('change', renderBoard);
  refreshBoardBtn?.addEventListener('click', renderBoard);

  setupDialog?.addEventListener('close', () => {
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

    button.disabled = empty && button.dataset.action !== 'save_notes' ? true : isBusy;
  });

  if (dialogNotes) dialogNotes.disabled = isBusy;
}

function requireBlockReason() {
  const reason = dialogNotes.value.trim();
  if (reason) return true;

  alert('Please add a reason before flagging Maintenance.\n\nExamples:\n- Tooling issue\n- Material missing\n- Machine fault\n- Waiting on maintenance');
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

  if (action === 'blocked' && !requireBlockReason()) return;

  if (action === 'clear') {
    const confirmed = window.confirm(
      `Clear setup for Press ${selected.pressNumber} Slot ${selected.slotIndex + 1}?\n\nThis removes the part number, quantity, status, and notes from this slot.`
    );
    if (!confirmed) return;
  }

  const actionLabels = {
    ready: 'mark this setup as Ready for Changeover',
    change_complete: 'complete this setup and shift the queue forward',
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

    if (action === 'change_complete') {
      openDieSetterLogin(selected.pressId, selected.slotIndex);
      setupDialog.close();
      return;
    }

    if (action === 'clear') {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: session.name,
        setup: {
          partNumber: '',
          qtyRemaining: 0,
          status: 'next',
          notes: '',
          previousSetup: slot,
          expectedUpdatedAt: slot.updatedAt || null
        }
      });
    } else {
      await updateSetupInFirestore({
        pressId: selected.pressId,
        slotIndex: selected.slotIndex,
        userName: action === 'ready' ? getActionUserName() : session.name,
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
      alert(`This slot was updated by ${error.lastUpdatedBy || 'another user'} before your change.\n\nPlease review the latest data and try again.`);
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

  areaFilterBoard.value =
    currentValue === 'all' || currentValue === 'unassigned' || areaNames.includes(currentValue)
      ? currentValue
      : 'all';
}

function filteredPresses() {
  return presses.filter((press) => {
    const pressArea = press.areaId && press.areaName ? press.areaName : 'unassigned';

    return (
      areaFilterBoard?.value === 'all' ||
      areaFilterBoard?.value === pressArea
    );
  });
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribePresses === 'function') unsubscribePresses();
});