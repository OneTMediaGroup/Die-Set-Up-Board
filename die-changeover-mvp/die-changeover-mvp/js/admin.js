import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';

const usersContainer = document.getElementById('usersContainer');
const refreshBtn = document.getElementById('refreshUsersBtn');
const userCount = document.getElementById('userCount');

let users = [];

init();

function init() {
  loadUsers();

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadUsers);
  }
}

async function loadUsers() {
  try {
    users = await fetchUsersFromFirestore();
    console.log('🔥 Admin users loaded:', users);
    renderUsers();
  } catch (err) {
    console.error('❌ Failed to load users:', err);
  }
}

function renderUsers() {
  if (userCount) {
    userCount.textContent = `Count: ${users.length}`;
  }

  if (!usersContainer) {
    console.error('❌ usersContainer element not found');
    return;
  }

  if (!users.length) {
    usersContainer.innerHTML = `
      <div class="user-card">
        <strong>No users found</strong>
        <div class="muted">Firestore returned zero users.</div>
      </div>
    `;
    return;
  }

  usersContainer.innerHTML = users.map((user) => `
    <div class="user-card">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <div>
          <strong>${user.name}</strong>
          <div>User ID: ${user.id}</div>
        </div>
        <span class="status-pill ${user.status === 'active' ? 'running' : 'blocked'}">
          ${user.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div class="user-row">
        <label>Role</label>
        <select data-role="${user.id}">
          <option value="dieSetter" ${user.role === 'dieSetter' ? 'selected' : ''}>dieSetter</option>
          <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>supervisor</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </div>

      <div class="user-row">
        <label>Status</label>
        <select data-status="${user.id}">
          <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>

      <button data-save="${user.id}" class="button primary">Save User</button>
      <div class="muted" style="margin-top:8px;">Current role: ${user.role}</div>
    </div>
  `).join('');

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
        await updateUserInFirestore(userId, { role, status });
        handleLiveSessionUpdate(userId, role, status);

        btn.textContent = 'Saved ✓';
        setTimeout(() => {
          btn.textContent = 'Save User';
        }, 1200);

        await loadUsers();
      } catch (err) {
        console.error('❌ Failed to save user:', err);
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

  if (status !== 'active') {
    alert(`${updatedUser.name || 'This user'} has been set to inactive.`);
  }

  console.log('🔄 Live session updated:', updatedUser);
}
