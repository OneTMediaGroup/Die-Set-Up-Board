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
  refreshBtn.addEventListener('click', loadUsers);
}

async function loadUsers() {
  try {
    users = await fetchUsersFromFirestore();
    renderUsers();
  } catch (err) {
    console.error('❌ Failed to load users:', err);
  }
}

function renderUsers() {
  userCount.textContent = `Count: ${users.length}`;

  usersContainer.innerHTML = users.map(user => `
    <div class="user-card">
      <strong>${user.name}</strong>
      <div>User ID: ${user.id}</div>

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
    </div>
  `).join('');

  wireSaveButtons();
}

function wireSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.save;

      const role = document.querySelector(`[data-role="${userId}"]`).value;
      const status = document.querySelector(`[data-status="${userId}"]`).value;

      try {
        await updateUserInFirestore(userId, { role, status });

        handleLiveSessionUpdate(userId, role, status);

        btn.textContent = 'Saved ✓';
        setTimeout(() => (btn.textContent = 'Save User'), 1200);

      } catch (err) {
        console.error('❌ Failed to save user:', err);
        alert('Save failed');
      }
    });
  });
}

function handleLiveSessionUpdate(userId, role, status) {
  const current = getSession();
  if (!current || current.id !== userId) return;

  const updatedUser = { ...current, role, status };

  // if user is deactivated → force downgrade
  if (status !== 'active') {
    alert('Your account has been deactivated.');
  }

  setSession(updatedUser);
  setStoredSessionUser(updatedUser);

  console.log('🔄 Live session updated:', updatedUser);
}
