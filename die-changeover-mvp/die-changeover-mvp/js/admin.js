import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';

const usersContainer = document.getElementById('usersContainer');
const refreshBtn = document.getElementById('refreshUsersBtn');
const userCount = document.getElementById('userCount');
const sidebarSessionText = document.getElementById('sidebarSessionText');

let users = [];

init();

async function init() {
  renderSidebarSession();
  await loadUsers();

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadUsers);
  }
}

function renderSidebarSession() {
  const session = getSession() || getStoredSessionUser();

  if (!sidebarSessionText) return;

  if (!session) {
    sidebarSessionText.textContent = 'No active user';
    return;
  }

  const statusText = session.status && session.status !== 'active' ? ` · ${session.status}` : '';
  sidebarSessionText.textContent = `${session.name} · ${session.role}${statusText}`;
}

async function loadUsers() {
  try {
    if (usersContainer) {
      usersContainer.innerHTML = `<div class="muted">Loading users...</div>`;
    }

    users = await fetchUsersFromFirestore();

    if (userCount) {
      userCount.textContent = `Count: ${users.length}`;
    }

    renderUsers();
  } catch (err) {
    console.error('❌ Failed to load users:', err);

    if (usersContainer) {
      usersContainer.innerHTML = `
        <div class="user-card">
          <strong>Load failed</strong>
          <div class="muted">Could not load users from Firestore.</div>
        </div>
      `;
    }

    if (userCount) {
      userCount.textContent = 'Count: 0';
    }
  }
}

function renderUsers() {
  if (!usersContainer) return;

  if (!users.length) {
    usersContainer.innerHTML = `
      <div class="user-card">
        <strong>No users found</strong>
        <div class="muted">Seed users or check Firestore project/config.</div>
      </div>
    `;
    return;
  }

  usersContainer.innerHTML = users.map((user) => {
    const status = user.status || (user.isActive === false ? 'inactive' : 'active');

    return `
      <div class="user-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <strong>${user.name}</strong>
            <div class="muted">User ID: ${user.id}</div>
          </div>
          <span class="status-pill ${status === 'active' ? 'running' : 'blocked'}">
            ${status === 'active' ? 'Active' : 'Inactive'}
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
            <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>

        <button data-save="${user.id}" class="button primary">Save User</button>
        <div class="muted" style="margin-top:8px;">Current role: ${user.role}</div>
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
          if (sameBtn) sameBtn.textContent = 'Save User';
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
  renderSidebarSession();

  if (status !== 'active') {
    alert(`${updatedUser.name || 'This user'} has been set to inactive.`);
  }

  console.log('🔄 Live session updated:', updatedUser);
}
