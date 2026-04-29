import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;
let users = [];
let editingUserId = null;

const ROLES = ['dieSetter', 'supervisor', 'admin'];

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
    root.innerHTML = `<h2>Users</h2><div class="muted">Could not load users.</div>`;
  }
}

function render() {
  root.innerHTML = `
    <h2>Users</h2>
    <p class="muted">Add users, assign role, set PIN, and manage access.</p>

    <div class="card">
      <h3>Add User</h3>

      <div class="grid-2" style="margin-top:12px;">
        <input id="newName" placeholder="Name" />
        <input id="newPin" placeholder="PIN" />

        <select id="newRole">
          ${ROLES.map((role) => `<option value="${role}">${role}</option>`).join('')}
        </select>

        <select id="newStatus">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <button id="addUserBtn" class="button primary" style="margin-top:12px;">Add User</button>
    </div>

    <div style="display:grid; gap:10px; margin-top:16px;">
      ${users.map(renderUserRow).join('')}
    </div>
  `;

  wireEvents();
}

function renderUserRow(user) {
  const status = user.status || 'active';
  const isEditing = editingUserId === user.id;
  const pinPreview = user.pin ? '••••' : 'No PIN';

  if (!isEditing) {
    return `
      <div class="card" style="padding:14px 16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <strong>${user.name || 'Unnamed User'}</strong>
            <span class="muted"> · ${user.role || 'no role'} · ${status}</span>
            <span class="muted"> · PIN: ${pinPreview}</span>
          </div>

          <div style="display:flex; gap:8px;">
            <button data-edit="${user.id}" class="button">Edit</button>
            <button data-delete="${user.id}" class="button">Delete</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <strong>Edit User</strong>

      <div class="grid-2" style="margin-top:12px;">
        <input data-name="${user.id}" value="${user.name || ''}" placeholder="Name" />
        <input data-pin="${user.id}" value="${user.pin || ''}" placeholder="PIN" />

        <select data-role="${user.id}">
          ${ROLES.map((role) => `
            <option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>
          `).join('')}
        </select>

        <select data-status="${user.id}">
          <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>

      <div style="margin-top:12px; display:flex; gap:10px;">
        <button data-save="${user.id}" class="button primary">Save</button>
        <button data-cancel-edit class="button">Cancel</button>
        <button data-delete="${user.id}" class="button">Delete</button>
      </div>
    </div>
  `;
}

function wireEvents() {
  root.querySelector('#addUserBtn')?.addEventListener('click', handleAddUser);

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUserId = btn.dataset.edit;
      render();
    });
  });

  root.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUserId = null;
      render();
    });
  });

  root.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await handleSaveUser(btn.dataset.save);
    });
  });

  root.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await handleDeleteUser(btn.dataset.delete);
    });
  });
}

async function handleAddUser() {
  const name = root.querySelector('#newName')?.value.trim();
  const pin = root.querySelector('#newPin')?.value.trim();
  const role = root.querySelector('#newRole')?.value;
  const status = root.querySelector('#newStatus')?.value;

  if (!name) return alert('Name required.');
  if (!pin) return alert('PIN required.');

  try {
    await addDoc(collection(db, 'users'), {
      name,
      pin,
      role,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Created user ${name} as ${role}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Add user failed:', error);
    alert('Add user failed.');
  }
}

async function handleSaveUser(userId) {
  const name = root.querySelector(`[data-name="${userId}"]`)?.value.trim();
  const pin = root.querySelector(`[data-pin="${userId}"]`)?.value.trim();
  const role = root.querySelector(`[data-role="${userId}"]`)?.value;
  const status = root.querySelector(`[data-status="${userId}"]`)?.value;

  if (!name) return alert('Name required.');
  if (!pin) return alert('PIN required.');

  try {
    await updateUserInFirestore(userId, {
      name,
      pin,
      role,
      status
    });

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

  if (!confirm(`Delete user "${name}"?`)) return;

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
