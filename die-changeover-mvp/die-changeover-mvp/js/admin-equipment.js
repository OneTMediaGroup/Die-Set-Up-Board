import { collection, addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getSession } from './store.js';
import { getStoredSessionUser } from './session-user.js';
import { fetchPressesFromFirestore, setPressLockInFirestore, archiveAndResetPressInFirestore } from './firestore-press-admin.js';
import { addAdminLog, emptySlots, equipmentLabel } from './admin-helpers.js';

let root = null;
let presses = [];

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
        <div><h2>Equipment Management</h2><p class="muted">Could not load equipment admin tools.</p></div>
      </div>
    `;
  }
}

function render() {
  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Equipment Management</h2>
        <p class="muted">Create, edit, delete, lock/unlock, and reset equipment.</p>
      </div>
      <button id="createEquipmentBtn" class="button primary admin-create-btn">+ Create Equipment</button>
    </div>

    <div class="admin-equipment-summary admin-card">
      <div class="admin-field-block">
        <label>Select Equipment</label>
        <select id="adminPressSelect">
          ${presses.map((press) => `
            <option value="${press.id}">
              ${equipmentLabel(press)}${press.isLocked ? ' · LOCKED' : ''}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="admin-field-block admin-summary-block">
        <label>Equipment Summary</label>
        <div id="adminPressSummary" class="admin-summary-text muted">No equipment selected.</div>
      </div>

      <div class="admin-equipment-actions">
        <button id="adminToggleLockBtn" class="button">Lock</button>
        <button id="adminResetPressBtn" class="button danger-outline">Archive + Reset</button>
      </div>
    </div>

    <div class="admin-edit-grid">
      <div>
        <label>Equipment Name</label>
        <div class="admin-inline-save">
          <input id="equipmentNameInput" placeholder="Example: 150B RH" />
          <button id="saveEquipmentNameBtn" class="button primary">Save Name</button>
        </div>
      </div>
      <div>
        <label>Equipment Number</label>
        <input id="equipmentNumberInput" disabled />
        <div class="muted admin-help-text">Number is assigned automatically.</div>
      </div>
    </div>

    <div class="admin-card admin-table-card">
      <div class="admin-table-title">All Equipment</div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipment Name</th>
              <th>Area</th>
              <th>Setups</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${renderEquipmentRows()}
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-info-panel">
      <strong>About Equipment</strong>
      <div class="muted">Locking equipment prevents operators and die setters from making changes. Archive + Reset saves the current state to history and clears all 4 slots.</div>
    </div>
  `;

  root.querySelector('#adminPressSelect')?.addEventListener('change', renderSummary);
  root.querySelector('#saveEquipmentNameBtn')?.addEventListener('click', handleSaveEquipmentName);
  root.querySelector('#createEquipmentBtn')?.addEventListener('click', handleCreateEquipment);
  root.querySelector('#adminToggleLockBtn')?.addEventListener('click', handleToggleLock);
  root.querySelector('#adminResetPressBtn')?.addEventListener('click', handleResetPress);

  root.querySelectorAll('[data-select-equipment]').forEach((button) => {
    button.addEventListener('click', () => {
      const select = root.querySelector('#adminPressSelect');
      if (!select) return;
      select.value = button.dataset.selectEquipment;
      renderSummary();
    });
  });

  root.querySelectorAll('[data-lock-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleToggleLock(button.dataset.lockEquipment);
    });
  });

  root.querySelectorAll('[data-reset-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleResetPress(button.dataset.resetEquipment);
    });
  });

  root.querySelectorAll('[data-delete-equipment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDeleteEquipment(button.dataset.deleteEquipment);
    });
  });

  renderSummary();
}

function renderEquipmentRows() {
  if (!presses.length) {
    return `
      <tr>
        <td colspan="6" class="muted">No equipment has been created yet.</td>
      </tr>
    `;
  }

  return presses.map((press, index) => {
    const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
    const areaLabel = press.areaName || 'Unassigned';
    const areaColor = press.areaColor || '#e5e7eb';
    const locked = Boolean(press.isLocked);

    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${equipmentLabel(press)}</strong></td>
        <td><span class="admin-area-pill" style="background:${areaColor}22; color:${areaColor};">${areaLabel}</span></td>
        <td>${activeCount}</td>
        <td><span class="admin-lock-state ${locked ? 'locked' : 'unlocked'}">${locked ? 'Locked' : 'Unlocked'}</span></td>
        <td>
          <div class="admin-row-actions">
            <button class="admin-table-action" title="Edit" data-select-equipment="${press.id}">✎</button>
            <button class="admin-table-action" title="Lock / Unlock" data-lock-equipment="${press.id}">🔒</button>
            <button class="admin-table-action danger" title="Archive + Reset" data-reset-equipment="${press.id}">▣</button>
            <button class="admin-table-action" title="Delete" data-delete-equipment="${press.id}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function selectedEquipment() {
  const select = root.querySelector('#adminPressSelect');
  return presses.find((press) => press.id === select?.value) || null;
}

function renderSummary() {
  const summary = root.querySelector('#adminPressSummary');
  const lockBtn = root.querySelector('#adminToggleLockBtn');
  const nameInput = root.querySelector('#equipmentNameInput');
  const numberInput = root.querySelector('#equipmentNumberInput');
  const press = selectedEquipment();

  if (!press || !summary || !lockBtn) {
    if (summary) summary.textContent = 'No equipment selected.';
    if (nameInput) nameInput.value = '';
    if (numberInput) numberInput.value = '';
    return;
  }

  const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
  summary.innerHTML = `
    ${equipmentLabel(press)} · ${activeCount} active setups · ${press.areaName ? `Area: ${press.areaName}` : 'Unassigned'} ·
    <span class="admin-lock-state ${press.isLocked ? 'locked' : 'unlocked'}">${press.isLocked ? 'Locked' : 'Unlocked'}</span>
  `;

  lockBtn.textContent = press.isLocked ? 'Unlock' : 'Lock';
  if (nameInput) nameInput.value = press.equipmentName || '';
  if (numberInput) numberInput.value = press.pressNumber || '';
}

async function handleCreateEquipment() {
  const name = prompt('Equipment name (example: 150B RH)');
  if (!name || !name.trim()) return;

  const nextNumber = presses.length ? Math.max(...presses.map((press) => Number(press.pressNumber || 0))) + 1 : 1;

  try {
    await addDoc(collection(db, 'presses'), {
      equipmentName: name.trim(),
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

    await addAdminLog(`Created equipment ${name.trim()}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to create equipment:', error);
    alert('Create equipment failed.');
  }
}

async function handleSaveEquipmentName() {
  const input = root.querySelector('#equipmentNameInput');
  const press = selectedEquipment();
  if (!press || !input) return;

  const oldName = equipmentLabel(press);
  const name = input.value.trim();

  if (!name) {
    alert('Equipment name cannot be blank.');
    input.focus();
    return;
  }

  try {
    await updateDoc(doc(db, 'presses', press.id), {
      equipmentName: name,
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Renamed equipment ${oldName} to ${name}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to save equipment name:', error);
    alert('Save equipment name failed.');
  }
}

async function handleDeleteEquipment(pressId = null) {
  const press = pressId ? presses.find((item) => item.id === pressId) : selectedEquipment();
  if (!press) return;

  const label = equipmentLabel(press);
  if (!confirm(`Delete equipment "${label}"?\n\nThis removes it from the system.`)) return;

  try {
    await deleteDoc(doc(db, 'presses', press.id));
    await addAdminLog(`Deleted equipment ${label}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to delete equipment:', error);
    alert('Delete equipment failed.');
  }
}

async function handleToggleLock(pressId = null) {
  const press = pressId ? presses.find((item) => item.id === pressId) : selectedEquipment();
  if (!press) return;

  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  const targetState = !press.isLocked;
  if (!confirm(`${targetState ? 'Lock' : 'Unlock'} ${equipmentLabel(press)}?`)) return;

  try {
    await setPressLockInFirestore({ pressId: press.id, isLocked: targetState, userName: session.name });
    await addAdminLog(`${targetState ? 'Locked' : 'Unlocked'} equipment ${equipmentLabel(press)}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to toggle equipment lock:', error);
    alert('Equipment lock update failed.');
  }
}

async function handleResetPress(pressId = null) {
  const press = pressId ? presses.find((item) => item.id === pressId) : selectedEquipment();
  if (!press) return;

  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  if (!confirm(`Archive and reset ${equipmentLabel(press)}?`)) return;

  try {
    await archiveAndResetPressInFirestore({ pressId: press.id, userName: session.name });
    await addAdminLog(`Archived and reset equipment ${equipmentLabel(press)}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to reset equipment:', error);
    alert('Archive + reset failed.');
  }
}
