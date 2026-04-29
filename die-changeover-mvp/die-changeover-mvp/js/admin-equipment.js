import { collection, addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { fetchPressesFromFirestore, archiveAndResetPressInFirestore } from './firestore-press-admin.js';
import { addAdminLog, emptySlots, equipmentLabel } from './admin-helpers.js';
import { getSession } from './store.js';
import { getStoredSessionUser } from './session-user.js';

let root = null;
let presses = [];
let searchText = '';
let editingId = null;

export async function mountEquipmentTool(container) {
  root = container;
  await loadAndRender();
  return () => {};
}

async function loadAndRender() {
  try {
    presses = await fetchPressesFromFirestore();
    render();
  } catch (error) {
    console.error('❌ Failed to load equipment:', error);
    root.innerHTML = `
      <div class="admin-content-header">
        <div>
          <h2>Equipment</h2>
          <p class="muted">Could not load equipment.</p>
        </div>
      </div>
    `;
  }
}

function render() {
  const filtered = presses.filter((press) => {
    const text = `${equipmentLabel(press)} ${press.areaName || ''}`.toLowerCase();
    return text.includes(searchText.toLowerCase());
  });

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Equipment</h2>
        <p class="muted">Create, search, edit, reset, and delete equipment.</p>
      </div>
    </div>

    <div class="admin-card">
      <h3>Add Equipment</h3>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <input id="newEquipmentName" placeholder="Example: 150B RH" />
        <button id="createEquipmentBtn" class="button primary">Add Equipment</button>
      </div>
    </div>

    <div class="admin-card admin-table-card" style="margin-top:16px;">
      <div class="section-header">
        <div>
          <h2>All Equipment</h2>
          <div class="muted">${filtered.length} shown · ${presses.length} total</div>
        </div>
        <input id="equipmentSearch" value="${searchText}" placeholder="Search equipment..." style="max-width:280px;" />
      </div>

      <div class="admin-table-wrap" style="margin-top:14px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipment</th>
              <th>Area</th>
              <th>Setups</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${renderEquipmentRows(filtered)}
          </tbody>
        </table>
      </div>
    </div>

    <div class="muted" style="margin-top:18px; text-align:center;">
      © One T Media Group
    </div>
  `;

  wireEvents();
}

function renderEquipmentRows(list) {
  if (!list.length) {
    return `<tr><td colspan="5" class="muted">No equipment found.</td></tr>`;
  }

  return list.map((press, index) => {
    const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
    const areaLabel = press.areaName || 'Unassigned';
    const areaColor = press.areaColor || '#64748b';
    const isEditing = editingId === press.id;

    if (isEditing) {
      return `
        <tr>
          <td>${index + 1}</td>
          <td colspan="4">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <input data-edit-name="${press.id}" value="${equipmentLabel(press)}" />
              <button class="button primary" data-save-equipment="${press.id}">Save</button>
              <button class="button" data-cancel-edit>Cancel</button>
              <button class="button danger-outline" data-reset-equipment="${press.id}">Reset</button>
              <button class="button" data-delete-equipment="${press.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${equipmentLabel(press)}</strong></td>
        <td><span class="admin-area-pill" style="background:${areaColor}22; color:${areaColor};">${areaLabel}</span></td>
        <td>${activeCount}</td>
        <td>
          <div class="admin-row-actions">
            <button class="button" data-edit-equipment="${press.id}">Edit</button>
            <button class="button danger-outline" data-reset-equipment="${press.id}">Reset</button>
            <button class="button" data-delete-equipment="${press.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function wireEvents() {
  root.querySelector('#createEquipmentBtn')?.addEventListener('click', handleCreateEquipment);

  root.querySelector('#equipmentSearch')?.addEventListener('input', (event) => {
    searchText = event.target.value;
    render();
  });

  root.querySelectorAll('[data-edit-equipment]').forEach((button) => {
    button.addEventListener('click', () => {
      editingId = button.dataset.editEquipment;
      render();
    });
  });

  root.querySelectorAll('[data-cancel-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      editingId = null;
      render();
    });
  });

  root.querySelectorAll('[data-save-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleSaveEquipment(button.dataset.saveEquipment);
    });
  });

  root.querySelectorAll('[data-reset-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleResetEquipment(button.dataset.resetEquipment);
    });
  });

  root.querySelectorAll('[data-delete-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDeleteEquipment(button.dataset.deleteEquipment);
    });
  });
}

async function handleCreateEquipment() {
  const input = root.querySelector('#newEquipmentName');
  const name = input?.value.trim();

  if (!name) {
    alert('Equipment name is required.');
    input?.focus();
    return;
  }

  const nextNumber = presses.length
    ? Math.max(...presses.map((press) => Number(press.pressNumber || 0))) + 1
    : 1;

  try {
    await addDoc(collection(db, 'presses'), {
      equipmentName: name,
      pressNumber: nextNumber,
      shift: '1',
      areaId: null,
      areaName: null,
      areaColor: null,
      isLocked: false,
      slots: emptySlots(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Created equipment ${name}`);
    editingId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to create equipment:', error);
    alert('Create equipment failed.');
  }
}

async function handleSaveEquipment(pressId) {
  const press = presses.find((item) => item.id === pressId);
  const input = root.querySelector(`[data-edit-name="${pressId}"]`);
  const name = input?.value.trim();

  if (!press || !name) {
    alert('Equipment name cannot be blank.');
    input?.focus();
    return;
  }

  const oldName = equipmentLabel(press);

  try {
    await updateDoc(doc(db, 'presses', press.id), {
      equipmentName: name,
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Renamed equipment ${oldName} to ${name}`);
    editingId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to save equipment:', error);
    alert('Save equipment failed.');
  }
}

async function handleDeleteEquipment(pressId) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  const label = equipmentLabel(press);

  if (!confirm(`Delete equipment "${label}"?\n\nThis removes it from the system.`)) return;

  try {
    await deleteDoc(doc(db, 'presses', press.id));
    await addAdminLog(`Deleted equipment ${label}`);
    editingId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to delete equipment:', error);
    alert('Delete equipment failed.');
  }
}

async function handleResetEquipment(pressId) {
  const press = presses.find((item) => item.id === pressId);
  if (!press) return;

  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const label = equipmentLabel(press);

  if (!confirm(`Reset "${label}"?\n\nThis clears all 4 slots and saves the old state to archives.`)) return;

  try {
    await archiveAndResetPressInFirestore({
      pressId: press.id,
      userName: session.name
    });

    await addAdminLog(`Reset equipment ${label}`);
    editingId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to reset equipment:', error);
    alert('Reset equipment failed.');
  }
}