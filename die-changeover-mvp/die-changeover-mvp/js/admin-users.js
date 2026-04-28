import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;
let users = [];

export async function mountUsersTool(container) {
  root = container;
  await loadAndRender();
  return () => {};
}

async function loadAndRender() {
  try {
    users = await fetchUsersFromFirestore();
    render();
  } catch (error) {
    console.error('❌ Failed to load users:', error);
    root.innerHTML = `<h2>Users</h2><div class="muted">Could not load users from Firestore.</div>`;
  }
}

function render() {
  root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <h2>Users</h2>
        <p class="muted">Manage roles and access.</p>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="muted">Count: <strong>${users.length}</strong></span>
        <button id="refreshUsersBtn" class="button">Refresh</button>
      </div>
    </div>
    <div style="display:grid; gap:16px; margin-top:16px;">${renderUserCards()}</div>
  `;

  root.querySelector('#refreshUsersBtn')?.addEventListener('click', loadAndRender);
  wireSaveButtons();
}

function renderUserCards() {
  if (!users.length) {
    return `<div class="card"><strong>No users found</strong><div class="muted">Seed users or check Firestore project/config.</div></div>`;
  }

  return users.map((user) => {
    const status = user.status || (user.isActive === false ? 'inactive' : 'active');
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div><strong>${user.name}</strong><div class="muted">User ID: ${user.id}</div></div>
          <span class="status-pill ${status === 'active' ? 'running' : 'blocked'}">${status === 'active' ? 'Active' : 'Inactive'}</span>
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
      </div>`;
  }).join('');
}

function wireSaveButtons() {
  root.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.save;
      const roleSelect = root.querySelector(`[data-role="${userId}"]`);
      const statusSelect = root.querySelector(`[data-status="${userId}"]`);
      if (!roleSelect || !statusSelect) return;

      try {
        btn.disabled = true;
        btn.textContent = 'Saving...';
        await updateUserInFirestore(userId, { role: roleSelect.value, status: statusSelect.value });
        handleLiveSessionUpdate(userId, roleSelect.value, statusSelect.value);
        await addAdminLog(`Updated user ${userId} to ${roleSelect.value} / ${statusSelect.value}`);
        await loadAndRender();
      } catch (error) {
        console.error('❌ Failed to save user:', error);
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
  const updatedUser = { ...current, role, status, isActive: status === 'active' };
  setSession(updatedUser);
  setStoredSessionUser(updatedUser);
}
