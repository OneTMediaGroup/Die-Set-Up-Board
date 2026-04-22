import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import {
  fetchPressesFromFirestore,
  setPressLockInFirestore,
  archiveAndResetPressInFirestore
} from './firestore-press-admin.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { mountUserSwitcher } from './user-switcher.js';
import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const usersContainer = document.getElementById('adminUsersList');
const refreshBtn = document.getElementById('refreshAdminUsersBtn');
const userCount = document.getElementById('adminUsersCount');
const currentAdminUser = document.getElementById('currentAdminUser');

const areasList = document.getElementById('areasList');
const addAreaBtn = document.getElementById('addAreaBtn');

let users = [];
let presses = [];
let areas = [];

init();

async function init() {
  renderCurrentAdminUser();

  await Promise.all([
    loadUsers(),
    loadPressTools(),
    loadAreas(),
    loadAreaPresses()
  ]);

  renderAreas();

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await Promise.all([
        loadUsers(),
        loadPressTools(),
        loadAreas(),
        loadAreaPresses()
      ]);
      renderAreas();
    });
  }

  if (addAreaBtn) {
    addAreaBtn.addEventListener('click', handleAddArea);
  }

  await mountUserSwitcher({
    selectId: 'userSwitcher',
    labelId: 'currentAdminUser',
    allowedRoles: ['admin', 'supervisor', 'dieSetter', 'operator']
  });
}

function renderCurrentAdminUser() {
  const session = getSession() || getStoredSessionUser();

  if (!currentAdminUser) return;

  if (!session) {
    currentAdminUser.textContent = 'No active user';
    return;
  }

  const statusText = session.status && session.status !== 'active' ? ` · ${session.status}` : '';
  currentAdminUser.textContent = `${session.name} · ${session.role}${statusText}`;
}

async function loadUsers() {
  try {
    if (usersContainer) {
      usersContainer.innerHTML = `<div class="muted">Loading users...</div>`;
    }

    users = await fetchUsersFromFirestore();

    if (userCount) {
      userCount.textContent = String(users.length);
    }

    renderUsers();
  } catch (err) {
    console.error('❌ Failed to load users:', err);

    if (usersContainer) {
      usersContainer.innerHTML = `
        <div class="card">
          <strong>Load failed</strong>
          <div class="muted">Could not load users from Firestore.</div>
        </div>
      `;
    }

    if (userCount) {
      userCount.textContent = '0';
    }
  }
}

function renderUsers() {
  if (!usersContainer) return;

  if (!users.length) {
    usersContainer.innerHTML = `
      <div class="card">
        <strong>No users found</strong>
        <div class="muted">Seed users or check Firestore project/config.</div>
      </div>
    `;
    return;
  }

  usersContainer.innerHTML = users.map((user) => {
    const status = user.status || (user.isActive === false ? 'inactive' : 'active');

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <strong>${user.name}</strong>
            <div class="muted">User ID: ${user.id}</div>
          </div>
          <span class="status-pill ${status === 'active' ? 'running' : 'blocked'}">
            ${status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div class="grid-2" style="margin-top:16px;">
          <div>
            <label class="muted">Role</label>
            <select data-role="${user.id}">
              <option value="operator" ${user.role === 'operator' ? 'selected' : ''}>operator</option>
              <option value="dieSetter" ${user.role === 'dieSetter' ? 'selected' : ''}>dieSetter</option>
              <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>supervisor</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
            </select>
          </div>

          <div>
            <label class="muted">Status</label>
            <select data-status="${user.id}">
              <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>

        <div style="margin-top:14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <button data-save="${user.id}" class="button primary">Save User</button>
          <span class="muted">Current role: ${user.role}</span>
        </div>
      </div>
    `;
  }).join('');

  wireSaveButtons();
}

function wireSaveButtons() {
  document.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.save;
      const roleSelect = document.querySelector(`[data-role="${userId}"]`);
      const statusSelect = document.querySelector(`[data-status="${userId}"]`);

      if (!roleSelect || !statusSelect) return;

      const role = roleSelect.value;
      const status = statusSelect.value;

      try {
        btn.disabled = true;
        btn.textContent = 'Saving...';

        await updateUserInFirestore(userId, { role, status });
        handleLiveSessionUpdate(userId, role, status);

        btn.textContent = 'Saved ✓';

        await loadUsers();

        setTimeout(() => {
          const sameBtn = document.querySelector(`[data-save="${userId}"]`);
          if (sameBtn) {
            sameBtn.textContent = 'Save User';
            sameBtn.disabled = false;
          }
        }, 1000);
      } catch (err) {
        console.error('❌ Failed to save user:', err);
        btn.disabled = false;
        btn.textContent = 'Save User';
        alert('Save failed');
      }
    });
  });
}

function handleLiveSessionUpdate(userId, role, status) {
  const current = getSession() || getStoredSessionUser();
  if (!current || current.id !== userId) return;

  const updatedUser = {
    ...current,
    role,
    status,
    isActive: status === 'active'
  };

  setSession(updatedUser);
  setStoredSessionUser(updatedUser);
  renderCurrentAdminUser();

  if (status !== 'active') {
    alert(`${updatedUser.name || 'This user'} has been set to inactive.`);
  }
}

async function loadPressTools() {
  try {
    presses = await fetchPressesFromFirestore();
    renderPressTools();
  } catch (error) {
    console.error('❌ Failed to load presses for admin:', error);
    renderPressToolsError();
  }
}

function renderPressTools() {
  const pressCard = document.querySelector('.grid-2 .card:first-child');
  const controlsCard = document.querySelector('.grid-2 .card:last-child');
  if (!pressCard || !controlsCard) return;

  pressCard.innerHTML = `
    <div class="section-header">
      <h2>Presses</h2>
    </div>
    <div class="muted" style="margin-bottom:14px;">Admin override tools for lock and reset.</div>

    <label class="muted">Select Press</label>
    <select id="adminPressSelect" style="margin-top:6px;">
      ${presses.map((press) => `
        <option value="${press.id}">
          Press ${press.pressNumber} · ${press.area} · ${press.shift}${press.isLocked ? ' · LOCKED' : ''}
        </option>
      `).join('')}
    </select>

    <div id="adminPressSummary" class="muted" style="margin-top:12px;"></div>

    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
      <button id="adminToggleLockBtn" class="button">Lock / Unlock</button>
      <button id="adminResetPressBtn" class="button">Archive + Reset Press</button>
    </div>
  `;

  controlsCard.innerHTML = `
    <div class="section-header">
      <h2>System Controls</h2>
    </div>
    <div class="muted">Archive + reset clears all slots after saving the old state into pressArchives.</div>
    <div class="muted" style="margin-top:10px;">Locked presses stay visible on the floor but cannot be changed by operators.</div>
  `;

  const select = document.getElementById('adminPressSelect');
  const lockBtn = document.getElementById('adminToggleLockBtn');
  const resetBtn = document.getElementById('adminResetPressBtn');

  if (select) {
    select.addEventListener('change', renderPressSummary);
    renderPressSummary();
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', handleToggleLock);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', handleResetPress);
  }
}

function renderPressSummary() {
  const select = document.getElementById('adminPressSelect');
  const summary = document.getElementById('adminPressSummary');
  const lockBtn = document.getElementById('adminToggleLockBtn');
  if (!select || !summary || !lockBtn) return;

  const press = presses.find((item) => item.id === select.value);
  if (!press) return;

  const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
  summary.textContent = `Press ${press.pressNumber} · ${activeCount} active setups · ${press.isLocked ? `Locked by ${press.lockedBy || 'Admin'}` : 'Unlocked'}`;
  lockBtn.textContent = press.isLocked ? 'Unlock Press' : 'Lock Press';
}

async function handleToggleLock() {
  const select = document.getElementById('adminPressSelect');
  if (!select) return;

  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const press = presses.find((item) => item.id === select.value);
  if (!press) return;

  const targetState = !press.isLocked;
  const confirmed = window.confirm(`${targetState ? 'Lock' : 'Unlock'} Press ${press.pressNumber}?`);
  if (!confirmed) return;

  try {
    await setPressLockInFirestore({
      pressId: press.id,
      isLocked: targetState,
      userName: session.name
    });

    await loadPressTools();
    await loadAreaPresses();
    renderAreas();
  } catch (error) {
    console.error('❌ Failed to toggle press lock:', error);
    alert('Press lock update failed.');
  }
}

async function handleResetPress() {
  const select = document.getElementById('adminPressSelect');
  if (!select) return;

  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const press = presses.find((item) => item.id === select.value);
  if (!press) return;

  const confirmed = window.confirm(
    `Archive and reset Press ${press.pressNumber}?\n\nThis will save current slots into pressArchives, then clear the press.`
  );
  if (!confirmed) return;

  try {
    await archiveAndResetPressInFirestore({
      pressId: press.id,
      userName: session.name
    });

    await loadPressTools();
    await loadAreaPresses();
    renderAreas();
    alert(`Press ${press.pressNumber} archived and reset.`);
  } catch (error) {
    console.error('❌ Failed to reset press:', error);
    alert('Archive + reset failed.');
  }
}

function renderPressToolsError() {
  const pressCard = document.querySelector('.grid-2 .card:first-child');
  if (!pressCard) return;

  pressCard.innerHTML = `
    <div class="section-header">
      <h2>Presses</h2>
    </div>
    <div class="muted">Could not load press admin tools.</div>
  `;
}

async function loadAreas() {
  if (!areasList) return;

  try {
    const snapshot = await getDocs(collection(db, 'areas'));
    areas = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  } catch (error) {
    console.error('❌ Failed to load areas:', error);
    areas = [];
  }
}

async function loadAreaPresses() {
  try {
    const snapshot = await getDocs(collection(db, 'presses'));
    presses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.error('❌ Failed to load presses for areas:', error);
    presses = [];
  }
}

function renderAreas() {
  if (!areasList) return;

  if (!areas.length) {
    areasList.innerHTML = `
      <div class="card">
        <strong>No areas yet</strong>
        <div class="muted">Add your first area like Forming or Rolling.</div>
      </div>
    `;
    return;
  }

  areasList.innerHTML = areas.map((area) => {
    const unassignedPresses = presses.filter((press) => !press.areaId);
    const areaPresses = presses.filter((press) => press.areaId === area.id);

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <strong>${area.name}</strong>
            <div class="muted">Order: ${area.order || 0}</div>
          </div>
        </div>

        <div style="margin-top:14px;">
          <label class="muted">Assign press to ${area.name}</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
            <select data-area-assign="${area.id}">
              <option value="">Select press</option>
              ${unassignedPresses.map((press) => `
                <option value="${press.id}">Press ${press.pressNumber} · ${press.area} · ${press.shift}</option>
              `).join('')}
            </select>
            <button class="button" data-area-assign-btn="${area.id}">Assign Press</button>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; gap:8px;">
          ${areaPresses.length
            ? areaPresses.map((press) => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:12px;">
                  <div>
                    <strong>Press ${press.pressNumber}</strong>
                    <div class="muted">${press.area} · ${press.shift}</div>
                  </div>
                  <button class="button" data-remove-press="${press.id}">Remove from Area</button>
                </div>
              `).join('')
            : `<div class="muted">No presses assigned yet.</div>`
          }
        </div>
      </div>
    `;
  }).join('');

  wireAreaButtons();
}

function wireAreaButtons() {
  document.querySelectorAll('[data-area-assign-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.areaAssignBtn;
      const select = document.querySelector(`[data-area-assign="${areaId}"]`);
      if (!select || !select.value) {
        alert('Pick a press first.');
        return;
      }

      try {
        await updateDoc(doc(db, 'presses', select.value), {
          areaId,
          updatedAt: new Date().toISOString()
        });

        await loadAreaPresses();
        await loadPressTools();
        renderAreas();
      } catch (error) {
        console.error('❌ Failed to assign press to area:', error);
        alert('Assign press failed.');
      }
    });
  });

  document.querySelectorAll('[data-remove-press]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pressId = btn.dataset.removePress;

      try {
        await updateDoc(doc(db, 'presses', pressId), {
          areaId: null,
          updatedAt: new Date().toISOString()
        });

        await loadAreaPresses();
        await loadPressTools();
        renderAreas();
      } catch (error) {
        console.error('❌ Failed to remove press from area:', error);
        alert('Remove press failed.');
      }
    });
  });
}

async function handleAddArea() {
  const name = window.prompt('Area name (example: Forming, Rolling)');
  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, 'areas'), {
      name: name.trim(),
      order: areas.length + 1,
      createdAt: new Date().toISOString()
    });

    await loadAreas();
    renderAreas();
  } catch (error) {
    console.error('❌ Failed to add area:', error);
    alert('Add area failed.');
  }
}
