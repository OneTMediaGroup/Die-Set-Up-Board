import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
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

    <div class="card">
      <h3>Add User</h3>
      <div class="grid-2" style="margin-top:12px;">
        <input id="newName" placeholder="Name" />
        <input id="newPin" placeholder="PIN" />
        <select id="newRole">
          <option value="operator">operator</option>
          <option value="dieSetter">dieSetter</option>
          <option value="supervisor">supervisor</option>
          <option value="admin">admin</option>
        </select>
        <select id="newStatus">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <button id="addUserBtn" class="button primary" style="margin-top:12px;">Add User</button>
    </div>

    <div style="display:grid; gap:16px; margin-top:16px;">
      ${users.map(renderUserCard).join('')}
    </div>
  `;

  wireEvents();
}

function renderUserCard(user) {
  const status = user.status || 'active';

  return `
    <div class="card">
      <strong>${user.name}</strong>

      <div class="grid-2" style="margin-top:12px;">
        <input data-name="${user.id}" value="${user.name || ''}" />
        <input data-pin="${user.id}" value="${user.pin || ''}" placeholder="PIN" />

        <select data-role="${user.id}">
          <option value="operator" ${user.role === 'operator' ? 'selected' : ''}>operator</option>
          <option value="dieSetter" ${user.role === 'dieSetter' ? 'selected' : ''}>dieSetter</option>
          <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>supervisor</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>

        <select data-status="${user.id}">
          <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>

      <div style="margin-top:12px; display:flex; gap:10px;">
        <button data-save="${user.id}" class="button primary">Save</button>
        <button data-delete="${user.id}" class="button">Delete</button>
      </div>
    </div>
  `;
}

function wireEvents() {
  // ADD USER
  document.getElementById('addUserBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newName').value.trim();
    const pin = document.getElementById('newPin').value.trim();
    const role = document.getElementById('newRole').value;
    const status = document.getElementById('newStatus').value;

    if (!name) return alert('Name required');
    if (role === 'dieSetter' && !pin) return alert('PIN required for die setters');

    await addDoc(collection(db, 'users'), {
      name,
      pin,
      role,
      status,
      createdAt: new Date().toISOString()
    });

    await addAdminLog(`Created user ${name}`);
    loadAndRender();
  });

  // SAVE USER
  root.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.save;

      const name = root.querySelector(`[data-name="${id}"]`).value;
      const pin = root.querySelector(`[data-pin="${id}"]`).value;
      const role = root.querySelector(`[data-role="${id}"]`).value;
      const status = root.querySelector(`[data-status="${id}"]`).value;

      if (role === 'dieSetter' && !pin) return alert('PIN required');

      await updateUserInFirestore(id, { name, pin, role, status });

      await addAdminLog(`Updated ${name}`);
      loadAndRender();
    });
  });

  // DELETE USER
  root.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delete;

      if (!confirm('Delete user?')) return;

      await deleteDoc(doc(db, 'users', id));
      await addAdminLog(`Deleted user ${id}`);
      loadAndRender();
    });
  });
}

function handleLiveSessionUpdate(userId, role, status) {
  const current = getSession() || getStoredSessionUser();
  if (!current || current.id !== userId) return;

  const updated = { ...current, role, status };
  setSession(updated);
  setStoredSessionUser(updated);
}
