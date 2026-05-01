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
        <h2>Equipment</h2>
        <p class="muted">Could not load equipment.</p>
      </div>
    `;
  }
}

function getFilteredPresses() {
  return presses.filter((press) => {
    const text = `${equipmentLabel(press)} ${press.areaName || ''}`.toLowerCase();
    return text.includes(searchText.toLowerCase());
  });
}

function render() {
  const filtered = getFilteredPresses();

  root.innerHTML = `
    <div>
      <div class="admin-content-header">
        <h2>Equipment</h2>
        <p class="muted">Create, search, edit, reset, and delete equipment.</p>
      </div>

      <div class="admin-card">
        <h3>Add Equipment</h3>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
          <input id="newEquipmentName" placeholder="Example: 150B RH" style="max-width:420px;" />
          <button id="createEquipmentBtn" class="button primary">Add</button>
        </div>
      </div>

      <div class="admin-card" style="margin-top:16px;">
        <h2>All Equipment</h2>
        <div id="equipmentCountText" class="muted" style="margin-bottom:12px;">
          ${filtered.length} shown · ${presses.length} total
        </div>

        <input
          id="equipmentSearch"
          value="${searchText}"
          placeholder="Search..."
          style="width:100%; margin-bottom:14px;"
        />

        <div id="equipmentTableBody" style="display:grid; gap:10px;">
          ${renderEquipmentRows(filtered)}
        </div>
      </div>

      <
    </div>
  `;

  wireEvents();
}

function refreshEquipmentTable() {
  const filtered = getFilteredPresses();

  const body = root.querySelector('#equipmentTableBody');
  const count = root.querySelector('#equipmentCountText');

  if (body) body.innerHTML = renderEquipmentRows(filtered);
  if (count) count.textContent = `${filtered.length} shown · ${presses.length} total`;

  wireRowEvents(); // ONLY rebind row buttons
}

function renderEquipmentRows(list) {
  if (!list.length) {
    return `<div class="muted">No equipment found.</div>`;
  }

  return list.map((press, index) => {
    const activeCount = (press.slots || []).filter((s) => s.partNumber).length;
    const areaLabel = press.areaName || 'Unassigned';
    const areaColor = press.areaColor || '#64748b';
    const isEditing = editingId === press.id;

    if (isEditing) {
      return `
        <div class="card" style="padding:14px;">
          <div style="display:grid; gap:10px;">
            <input data-edit-name="${press.id}" value="${equipmentLabel(press)}" />
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="button primary" data-save-equipment="${press.id}">Save</button>
              <button class="button" data-cancel-edit>Cancel</button>
              <button class="button danger-outline" data-reset-equipment="${press.id}">Reset</button>
              <button class="button" data-delete-equipment="${press.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <strong>${index + 1}. ${equipmentLabel(press)}</strong>
            <div class="muted">
              Area: <span style="color:${areaColor}; font-weight:700;">${areaLabel}</span>
              · ${activeCount} setup${activeCount === 1 ? '' : 's'}
            </div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="button" data-edit-equipment="${press.id}">Edit</button>
            <button class="button danger-outline" data-reset-equipment="${press.id}">Reset</button>
            <button class="button" data-delete-equipment="${press.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ---------- EVENTS ---------- */

function wireEvents() {
  root.querySelector('#createEquipmentBtn')?.addEventListener('click', handleCreateEquipment);

  root.querySelector('#equipmentSearch')?.addEventListener('input', (e) => {
    searchText = e.target.value;
    refreshEquipmentTable(); // 🔥 no full render = FIXED
  });

  wireRowEvents();
}

function wireRowEvents() {
  root.querySelectorAll('[data-edit-equipment]').forEach((btn) => {
    btn.onclick = () => {
      editingId = btn.dataset.editEquipment;
      render();
    };
  });

  root.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.onclick = () => {
      editingId = null;
      render();
    };
  });

  root.querySelectorAll('[data-save-equipment]').forEach((btn) => {
    btn.onclick = async () => {
      await handleSaveEquipment(btn.dataset.saveEquipment);
    };
  });

  root.querySelectorAll('[data-reset-equipment]').forEach((btn) => {
    btn.onclick = async () => {
      await handleResetEquipment(btn.dataset.resetEquipment);
    };
  });

  root.querySelectorAll('[data-delete-equipment]').forEach((btn) => {
    btn.onclick = async () => {
      await handleDeleteEquipment(btn.dataset.deleteEquipment);
    };
  });
}

/* ---------- ACTIONS ---------- */

async function handleCreateEquipment() {
  const input = root.querySelector('#newEquipmentName');
  const name = input?.value.trim();

  if (!name) return alert('Enter equipment name');

  const nextNumber = presses.length
    ? Math.max(...presses.map(p => Number(p.pressNumber || 0))) + 1
    : 1;

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

  await addAdminLog(`Created ${name}`);
  editingId = null;
  await loadAndRender();
}

async function handleSaveEquipment(id) {
  const press = presses.find(p => p.id === id);
  const input = root.querySelector(`[data-edit-name="${id}"]`);
  const name = input?.value.trim();

  if (!name) return alert('Name required');

  await updateDoc(doc(db, 'presses', id), {
    equipmentName: name,
    updatedAt: new Date().toISOString()
  });

  await addAdminLog(`Renamed ${equipmentLabel(press)} to ${name}`);
  editingId = null;
  await loadAndRender();
}

async function handleDeleteEquipment(id) {
  const press = presses.find(p => p.id === id);
  if (!confirm(`Delete ${equipmentLabel(press)}?`)) return;

  await deleteDoc(doc(db, 'presses', id));
  await addAdminLog(`Deleted ${equipmentLabel(press)}`);
  editingId = null;
  await loadAndRender();
}

async function handleResetEquipment(id) {
  const press = presses.find(p => p.id === id);
  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };

  if (!confirm(`Reset ${equipmentLabel(press)}?`)) return;

  await archiveAndResetPressInFirestore({
    pressId: id,
    userName: session.name
  });

  await addAdminLog(`Reset ${equipmentLabel(press)}`);
  editingId = null;
  await loadAndRender();
}