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
  deleteDoc,
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
    addAreaBtn.onclick = handleAddArea;
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
  currentAdminUser.textContent = session ? `${session.name} · ${session.role}` : 'No active user';
}

async function loadUsers() {
  users = await fetchUsersFromFirestore();
  if (userCount) userCount.textContent = String(users.length);
  renderUsers();
}

function renderUsers() {
  if (!usersContainer) return;

  usersContainer.innerHTML = users.map((user) => {
    const status = user.status || (user.isActive === false ? 'inactive' : 'active');

    return `
      <div class="card">
        <strong>${user.name}</strong>
        <div class="muted">User ID: ${user.id}</div>

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

        <button data-save="${user.id}" class="button primary" style="margin-top:14px;">Save User</button>
      </div>
    `;
  }).join('');

  wireSaveButtons();
}

function wireSaveButtons() {
  document.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.save;
      const role = document.querySelector(`[data-role="${userId}"]`)?.value;
      const status = document.querySelector(`[data-status="${userId}"]`)?.value;

      if (!role || !status) return;

      btn.disabled = true;
      btn.textContent = 'Saving...';

      await updateUserInFirestore(userId, { role, status });
      handleLiveSessionUpdate(userId, role, status);

      await loadUsers();
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
}

async function loadPressTools() {
  presses = await fetchPressesFromFirestore();
  renderPressTools();
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

    <select id="adminPressSelect">
      ${presses.map((press) => `
        <option value="${press.id}">
          ${press.equipmentName || `${press.equipmentName || `Press ${press.pressNumber}`}`} · ${press.area} · ${press.shift}${press.isLocked ? ' · LOCKED' : ''}
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
  `;

  document.getElementById('adminPressSelect')?.addEventListener('change', renderPressSummary);
  document.getElementById('adminToggleLockBtn')?.addEventListener('click', handleToggleLock);
  document.getElementById('adminResetPressBtn')?.addEventListener('click', handleResetPress);

  renderPressSummary();
}

function renderPressSummary() {
  const select = document.getElementById('adminPressSelect');
  const summary = document.getElementById('adminPressSummary');
  const lockBtn = document.getElementById('adminToggleLockBtn');
  if (!select || !summary || !lockBtn) return;

  const press = presses.find((item) => item.id === select.value);
  if (!press) return;

  const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
  summary.textContent = `${press.equipmentName || `${press.equipmentName || `Press ${press.pressNumber}`}`} · ${activeCount} active setups · ${press.isLocked ? `Locked by ${press.lockedBy || 'Admin'}` : 'Unlocked'}`;
  lockBtn.textContent = press.isLocked ? 'Unlock Press' : 'Lock Press';
}

async function handleToggleLock() {
  const select = document.getElementById('adminPressSelect');
  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const press = presses.find((item) => item.id === select?.value);
  if (!press) return;

  const targetState = !press.isLocked;
  if (!confirm(`${targetState ? 'Lock' : 'Unlock'} ${press.equipmentName || `Press ${press.pressNumber}`}?`)) return;

  await setPressLockInFirestore({
    pressId: press.id,
    isLocked: targetState,
    userName: session.name
  });

  await loadPressTools();
  await loadAreaPresses();
  renderAreas();
}

async function handleResetPress() {
  const select = document.getElementById('adminPressSelect');
  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const press = presses.find((item) => item.id === select?.value);
  if (!press) return;

  if (!confirm(`Archive and reset ${press.equipmentName || `Press ${press.pressNumber}`}?`)) return;

  await archiveAndResetPressInFirestore({
    pressId: press.id,
    userName: session.name
  });

  await loadPressTools();
  await loadAreaPresses();
  renderAreas();
}

async function loadAreas() {
  const snapshot = await getDocs(collection(db, 'areas'));
  areas = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function loadAreaPresses() {
  const snapshot = await getDocs(collection(db, 'presses'));
  presses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
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
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>
            <strong style="color:${area.color || '#3b82f6'}">${area.name}</strong>
            <div class="muted">Order: ${area.order || 0}</div>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="color" data-area-color="${area.id}" value="${area.color || '#3b82f6'}" />
            <button class="button" data-save-area-color="${area.id}">Save Color</button>
            <button class="button" data-rename-area="${area.id}">Rename</button>
            <button class="button" data-delete-area="${area.id}">Delete</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <label class="muted">Assign press to ${area.name}</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
            <select data-area-assign="${area.id}">
              <option value="">Select press</option>
              ${unassignedPresses.map((press) => `
                <option value="${press.id}">
  ${press.equipmentName || `${press.equipmentName || `Press ${press.pressNumber}`}`}
</option>
              `).join('')}
            </select>
            <button class="button" data-area-assign-btn="${area.id}">Assign Press</button>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; gap:8px;">
          ${areaPresses.length
            ? areaPresses.map((press) => `
              <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border-left:6px solid ${area.color || '#3b82f6'}; border-radius:12px;">
                <div>
                  <strong>${press.equipmentName || `Press ${press.pressNumber}`}</strong>
                  <div class="muted">${press.area || area.name} · ${press.shift}</div>
                </div>
                <button class="button" data-remove-press="${press.id}">Remove</button>
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
      const area = areas.find((item) => item.id === areaId);
      const select = document.querySelector(`[data-area-assign="${areaId}"]`);

      if (!select?.value || !area) return alert('Pick a press first.');

      await updateDoc(doc(db, 'presses', select.value), {
        areaId,
        areaName: area.name,
        areaColor: area.color || '#3b82f6',
        updatedAt: new Date().toISOString()
      });

      await loadAreaPresses();
      await loadPressTools();
      renderAreas();
    });
  });

  document.querySelectorAll('[data-remove-press]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await updateDoc(doc(db, 'presses', btn.dataset.removePress), {
        areaId: null,
        areaName: null,
        areaColor: null,
        updatedAt: new Date().toISOString()
      });

      await loadAreaPresses();
      await loadPressTools();
      renderAreas();
    });
  });

  document.querySelectorAll('[data-save-area-color]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.saveAreaColor;
      const input = document.querySelector(`[data-area-color="${areaId}"]`);
      const area = areas.find((item) => item.id === areaId);
      if (!input || !area) return;

      await updateDoc(doc(db, 'areas', areaId), {
        color: input.value,
        updatedAt: new Date().toISOString()
      });

      const assigned = presses.filter((press) => press.areaId === areaId);

      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaName: area.name,
          areaColor: input.value,
          updatedAt: new Date().toISOString()
        });
      }

      await loadAreas();
      await loadAreaPresses();
      await loadPressTools();
      renderAreas();
    });
  });

  document.querySelectorAll('[data-rename-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.renameArea;
      const area = areas.find((item) => item.id === areaId);
      const name = prompt('New area name:', area?.name || '');
      if (!name?.trim()) return;

      await updateDoc(doc(db, 'areas', areaId), {
        name: name.trim(),
        updatedAt: new Date().toISOString()
      });

      const assigned = presses.filter((press) => press.areaId === areaId);

      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaName: name.trim(),
          areaColor: area?.color || '#3b82f6',
          updatedAt: new Date().toISOString()
        });
      }

      await loadAreas();
      await loadAreaPresses();
      await loadPressTools();
      renderAreas();
    });
  });

  document.querySelectorAll('[data-delete-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.deleteArea;
      if (!confirm('Delete this area? Presses will be unassigned.')) return;

      const assigned = presses.filter((press) => press.areaId === areaId);

      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaId: null,
          areaName: null,
          areaColor: null,
          updatedAt: new Date().toISOString()
        });
      }

      await deleteDoc(doc(db, 'areas', areaId));

      await loadAreas();
      await loadAreaPresses();
      await loadPressTools();
      renderAreas();
    });
  });
}
async function handleAddArea() {
  const name = prompt('Area name (example: Forming, Rolling)');
  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, 'areas'), {
      name: name.trim(),
      color: '#3b82f6',
      order: areas.length + 1,
      createdAt: new Date().toISOString()
    });

    await loadAreas();
    await loadAreaPresses();
    renderAreas();
  } catch (error) {
    console.error('❌ Add area failed:', error);
    alert('Add area failed. Check console.');
  }
}
