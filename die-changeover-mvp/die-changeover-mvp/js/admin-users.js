import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;
let users = [];
let editingUserId = null;
let searchText = '';
let roleFilter = 'all';

const ROLES = [
  { value: 'dieSetter', label: 'Die Setter' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' }
];

const ROLE_ORDER = {
  dieSetter: 1,
  supervisor: 2,
  admin: 3
};

export async function mountUsersTool(container) {
  root = container;
  await loadAndRender();
  return () => {};
}

async function loadAndRender() {
  try {
    users = await fetchUsersFromFirestore();
    sortUsers();
    render();
  } catch (error) {
    console.error('❌ Failed to load users:', error);
    root.innerHTML = `<h2>Users</h2><div class="muted">Could not load users.</div>`;
  }
}

function sortUsers() {
  users = [...users].sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] || 99;
    const roleB = ROLE_ORDER[b.role] || 99;
    if (roleA !== roleB) return roleA - roleB;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
  });
}

function roleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label || role || 'No Role';
}

function statusFor(user) {
  return user.status || (user.isActive === false ? 'inactive' : 'active');
}

function filteredUsers() {
  return users.filter((user) => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const search = searchText.trim().toLowerCase();
    const matchesSearch = !search ||
      String(user.name || '').toLowerCase().includes(search) ||
      String(user.role || '').toLowerCase().includes(search) ||
      String(user.id || '').toLowerCase().includes(search);

    return matchesRole && matchesSearch;
  });
}

function roleCount(role) {
  return users.filter((user) => user.role === role).length;
}

function render() {
  const visibleUsers = filteredUsers();

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Users</h2>
        <p class="muted">Add users, set roles, manage PINs, and control access.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Total</span><strong>${users.length}</strong></div>
        <div class="header-stat"><span>Active</span><strong>${users.filter((user) => statusFor(user) === 'active').length}</strong></div>
      </div>
    </div>

    <div class="admin-card user-add-panel">
      <div class="section-header">
        <div>
          <h2>Add User</h2>
          <div class="muted">Die setters need a PIN for Complete + Shift.</div>
        </div>
      </div>

      <div class="user-add-grid">
        <label>
          <span>Name</span>
          <input id="newUserName" placeholder="Example: Bab S." autocomplete="off" />
        </label>

        <label>
          <span>Role</span>
          <select id="newUserRole">
            ${ROLES.map((role) => `<option value="${role.value}" ${role.value === 'dieSetter' ? 'selected' : ''}>${role.label}</option>`).join('')}
          </select>
        </label>

        <label>
          <span>PIN</span>
          <input id="newUserPin" type="password" inputmode="numeric" placeholder="4 digit PIN" autocomplete="new-password" />
        </label>

        <label>
          <span>Status</span>
          <select id="newUserStatus">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <button id="addUserBtn" class="button primary user-add-button">+ Add User</button>
      </div>
    </div>

    <div class="admin-card user-management-panel">
      <div class="section-header">
        <div>
          <h2>User List</h2>
          <div class="muted">Single-line rows. Click Edit only when you need to change details or reset a PIN.</div>
        </div>
        <button id="refreshUsersBtn" class="button">Refresh</button>
      </div>

      <div class="user-toolbar">
        <input id="userSearchInput" value="${escapeAttr(searchText)}" placeholder="Search users..." />
        <select id="userRoleFilter">
          <option value="all" ${roleFilter === 'all' ? 'selected' : ''}>All roles (${users.length})</option>
          ${ROLES.map((role) => `<option value="${role.value}" ${roleFilter === role.value ? 'selected' : ''}>${role.label} (${roleCount(role.value)})</option>`).join('')}
        </select>
      </div>

      <div class="user-row-list">
        ${visibleUsers.length ? visibleUsers.map(renderUserRow).join('') : `<div class="muted user-empty-state">No users match this search.</div>`}
      </div>
    </div>
  `;

  wireEvents();
}

function renderUserRow(user) {
  const status = statusFor(user);
  const isEditing = editingUserId === user.id;
  const pinPreview = user.pin ? '••••' : 'No PIN';
  const roleClass = `role-${String(user.role || 'none').toLowerCase()}`;

  if (!isEditing) {
    return `
      <div class="user-row compact-user-row">
        <div class="user-main-line">
          <strong>${escapeHtml(user.name || 'Unnamed User')}</strong>
          <span class="user-role-pill ${roleClass}">${roleLabel(user.role)}</span>
          <span class="status-pill ${status === 'active' ? 'running' : 'blocked'}">${status === 'active' ? 'Active' : 'Inactive'}</span>
          <span class="muted user-pin-preview">PIN: ${pinPreview}</span>
        </div>

        <div class="user-row-actions">
          <button data-edit-user="${user.id}" class="button">Edit</button>
          <button data-delete-user="${user.id}" class="button danger-outline">Delete</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="user-row user-edit-row">
      <div class="section-header">
        <div>
          <h2>Edit ${escapeHtml(user.name || 'User')}</h2>
          <div class="muted">User ID: ${escapeHtml(user.id)}</div>
        </div>
      </div>

      <div class="user-edit-grid">
        <label>
          <span>Name</span>
          <input data-user-name="${user.id}" value="${escapeAttr(user.name || '')}" placeholder="Name" />
        </label>

        <label>
          <span>Role</span>
          <select data-user-role="${user.id}">
            ${ROLES.map((role) => `<option value="${role.value}" ${user.role === role.value ? 'selected' : ''}>${role.label}</option>`).join('')}
          </select>
        </label>

        <label>
          <span>PIN</span>
          <input data-user-pin="${user.id}" value="${escapeAttr(user.pin || '')}" inputmode="numeric" placeholder="PIN" autocomplete="new-password" />
        </label>

        <label>
          <span>Status</span>
          <select data-user-status="${user.id}">
            <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
      </div>

      <div class="user-edit-actions">
        <button data-save-user="${user.id}" class="button primary">Save Changes</button>
        <button data-cancel-edit class="button">Cancel</button>
        <button data-delete-user="${user.id}" class="button danger-outline">Delete User</button>
      </div>
    </div>
  `;
}

function wireEvents() {
  root.querySelector('#addUserBtn')?.addEventListener('click', handleAddUser);
  root.querySelector('#refreshUsersBtn')?.addEventListener('click', loadAndRender);

  root.querySelector('#userSearchInput')?.addEventListener('input', (event) => {
    searchText = event.target.value;
    editingUserId = null;
    render();
  });

  root.querySelector('#userRoleFilter')?.addEventListener('change', (event) => {
    roleFilter = event.target.value;
    editingUserId = null;
    render();
  });

  root.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      editingUserId = button.dataset.editUser;
      render();
    });
  });

  root.querySelectorAll('[data-cancel-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      editingUserId = null;
      render();
    });
  });

  root.querySelectorAll('[data-save-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleSaveUser(button.dataset.saveUser);
    });
  });

  root.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDeleteUser(button.dataset.deleteUser);
    });
  });
}

async function handleAddUser() {
  const nameInput = root.querySelector('#newUserName');
  const pinInput = root.querySelector('#newUserPin');
  const roleInput = root.querySelector('#newUserRole');
  const statusInput = root.querySelector('#newUserStatus');

  const name = nameInput?.value.trim() || '';
  const pin = pinInput?.value.trim() || '';
  const role = roleInput?.value || 'dieSetter';
  const status = statusInput?.value || 'active';

  if (!name) {
    alert('Name is required.');
    nameInput?.focus();
    return;
  }

  if (role === 'dieSetter' && !pin) {
    alert('PIN is required for die setters.');
    pinInput?.focus();
    return;
  }

  try {
    await addDoc(collection(db, 'users'), {
      name,
      pin,
      role,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Created user ${name} as ${roleLabel(role)}`);
    searchText = '';
    roleFilter = 'all';
    await loadAndRender();
  } catch (error) {
    console.error('❌ Add user failed:', error);
    alert('Add user failed.');
  }
}

async function handleSaveUser(userId) {
  const nameInput = root.querySelector(`[data-user-name="${userId}"]`);
  const pinInput = root.querySelector(`[data-user-pin="${userId}"]`);
  const roleInput = root.querySelector(`[data-user-role="${userId}"]`);
  const statusInput = root.querySelector(`[data-user-status="${userId}"]`);

  const name = nameInput?.value.trim() || '';
  const pin = pinInput?.value.trim() || '';
  const role = roleInput?.value || 'dieSetter';
  const status = statusInput?.value || 'active';

  if (!name) {
    alert('Name is required.');
    nameInput?.focus();
    return;
  }

  if (role === 'dieSetter' && !pin) {
    alert('PIN is required for die setters.');
    pinInput?.focus();
    return;
  }

  try {
    await updateUserInFirestore(userId, {
      name,
      pin,
      role,
      status
    });

    handleLiveSessionUpdate(userId, { name, pin, role, status });
    await addAdminLog(`Updated user ${name}`);
    editingUserId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Save user failed:', error);
    alert('Save failed.');
  }
}

async function handleDeleteUser(userId) {
  const user = users.find((item) => item.id === userId);
  const name = user?.name || userId;
  const current = getSession() || getStoredSessionUser();

  if (current?.id === userId) {
    alert('You cannot delete the currently selected session user. Switch to another admin first.');
    return;
  }

  if (!confirm(`Delete user "${name}"?\n\nThis cannot be undone.`)) return;

  try {
    await deleteDoc(doc(db, 'users', userId));
    await addAdminLog(`Deleted user ${name}`);
    editingUserId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Delete user failed:', error);
    alert('Delete failed.');
  }
}

function handleLiveSessionUpdate(userId, updates) {
  const current = getSession() || getStoredSessionUser();
  if (!current || current.id !== userId) return;

  const updatedUser = { ...current, ...updates };
  setSession(updatedUser);
  setStoredSessionUser(updatedUser);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
