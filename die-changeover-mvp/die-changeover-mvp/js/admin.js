import { initStore, getSession, setSession } from './store.js';
import { fetchUsersFromFirestore, watchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';

initStore();

const currentAdminUser = document.getElementById('currentAdminUser');
const adminUsersList = document.getElementById('adminUsersList');
const adminUsersCount = document.getElementById('adminUsersCount');
const refreshAdminUsersBtn = document.getElementById('refreshAdminUsersBtn');

let users = [];
let unsubscribeUsers = null;

bootstrapAdminSession();
wireEvents();
startUsersWatcher();

async function bootstrapAdminSession() {
  const storedUser = getStoredSessionUser();

  if (storedUser && storedUser.role === 'admin') {
    setSession(storedUser);
    if (currentAdminUser) {
      currentAdminUser.textContent = `${storedUser.name} · ${storedUser.role}`;
    }
    return;
  }

  try {
    const liveUsers = await fetchUsersFromFirestore();
    const defaultAdmin =
      liveUsers.find((user) => user.role === 'admin') || {
        id: 'admin1',
        name: 'IT Admin',
        role: 'admin'
      };

    setStoredSessionUser(defaultAdmin);
    setSession(defaultAdmin);

    if (currentAdminUser) {
      currentAdminUser.textContent = `${defaultAdmin.name} · ${defaultAdmin.role}`;
    }
  } catch (error) {
    console.error('❌ Failed loading admin user:', error);

    const fallbackAdmin = {
      id: 'admin1',
      name: 'IT Admin',
      role: 'admin'
    };

    setSession(fallbackAdmin);

    if (currentAdminUser) {
      currentAdminUser.textContent = `${fallbackAdmin.name} · ${fallbackAdmin.role}`;
    }
  }
}

function startUsersWatcher() {
  unsubscribeUsers = watchUsersFromFirestore((liveUsers) => {
    users = liveUsers;
    renderUsers();
  });
}

function renderUsers() {
  if (adminUsersCount) {
    adminUsersCount.textContent = String(users.length);
  }

  if (!adminUsersList) return;

  adminUsersList.innerHTML = users.length
    ? users.map((user) => renderUserCard(user)).join('')
    : `
      <div class="card">
        <h3>No users found</h3>
        <p class="muted">Seed users first, then reload this page.</p>
      </div>
    `;

  wireUserCards();
}

function renderUserCard(user) {
  return `
    <article class="card admin-user-card" data-user-id="${user.id}">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <h3 style="margin:0 0 4px 0;">${user.name || 'Unnamed User'}</h3>
          <div class="muted">User ID: ${user.id}</div>
        </div>
        <span class="status-pill ${user.isActive ? 'running' : 'not_running'}">
          ${user.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(2, minmax(180px, 1fr)); gap:12px; margin-top:16px;">
        <label style="display:flex; flex-direction:column; gap:6px;">
          <span class="muted">Role</span>
          <select class="admin-role-select" data-user-id="${user.id}">
            <option value="dieSetter" ${user.role === 'dieSetter' ? 'selected' : ''}>dieSetter</option>
            <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>supervisor</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </label>

        <label style="display:flex; flex-direction:column; gap:6px;">
          <span class="muted">Status</span>
          <select class="admin-active-select" data-user-id="${user.id}">
            <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
            <option value="false" ${!user.isActive ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
      </div>

      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        <button class="button primary admin-save-user-btn" data-user-id="${user.id}">
          Save User
        </button>
      </div>

      <div class="muted" style="margin-top:12px;">
        Current role: ${user.role || '—'}
      </div>
    </article>
  `;
}

function wireUserCards() {
  document.querySelectorAll('.admin-save-user-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      const roleSelect = document.querySelector(`.admin-role-select[data-user-id="${userId}"]`);
      const activeSelect = document.querySelector(`.admin-active-select[data-user-id="${userId}"]`);

      if (!roleSelect || !activeSelect) return;

      const nextRole = roleSelect.value;
      const nextActive = activeSelect.value === 'true';

      try {
        button.disabled = true;
        button.textContent = 'Saving...';

        await updateUserInFirestore(userId, {
          role: nextRole,
          isActive: nextActive
        });

        button.textContent = 'Saved';
        setTimeout(() => {
          button.textContent = 'Save User';
          button.disabled = false;
        }, 700);
      } catch (error) {
        console.error('❌ Failed updating user:', error);
        button.textContent = 'Save Failed';
        setTimeout(() => {
          button.textContent = 'Save User';
          button.disabled = false;
        }, 1000);
      }
    });
  });
}

function wireEvents() {
  if (refreshAdminUsersBtn) {
    refreshAdminUsersBtn.addEventListener('click', async () => {
      try {
        users = await fetchUsersFromFirestore();
        renderUsers();
      } catch (error) {
        console.error('❌ Failed refreshing users:', error);
      }
    });
  }
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribeUsers === 'function') {
    unsubscribeUsers();
  }
});
