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
    root.innerHTML = `<h2>Equipment</h2><div class="muted">Could not load equipment admin tools.</div>`;
  }
}

function render() {
  root.innerHTML = `
    <div class="section-header"><h2>Equipment</h2></div>
    <p class="muted">Create, edit, delete, lock/unlock, and reset equipment.</p>

    <div class="card" style="margin-top:16px;">
      <label class="muted">Create New Equipment</label>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
        <input id="newEquipmentNameInput" placeholder="Example: 150B RH" />
        <button id="createEquipmentBtn" class="button primary">Create Equipment</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <label class="muted">Select Equipment to Edit</label>
      <select id="adminPressSelect" style="margin-top:6px;">
        ${presses.map((press) => `<option value="${press.id}">${equipmentLabel(press)}${press.isLocked ? ' · LOCKED' : ''}</option>`).join('')}
      </select>

      <div id="adminPressSummary" class="muted" style="margin-top:12px;"></div>

      <div style="margin-top:14px;">
        <label class="muted">Equipment Name</label>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
          <input id="equipmentNameInput" placeholder="Example: 150B RH" />
          <button id="saveEquipmentNameBtn" class="button primary">Save Name</button>
        </div>
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
        <button id="adminToggleLockBtn" class="button">Lock / Unlock</button>
        <button id="adminResetPressBtn" class="button">Archive + Reset</button>
        <button id="deleteEquipmentBtn" class="button">Delete Equipment</button>
      </div>
    </div>
  `;

  root.querySelector('#adminPressSelect')?.addEventListener('change', renderSummary);
  root.querySelector('#saveEquipmentNameBtn')?.addEventListener('click', handleSaveEquipmentName);
  root.querySelector('#createEquipmentBtn')?.addEventListener('click', handleCreateEquipment);
  root.querySelector('#deleteEquipmentBtn')?.addEventListener('click', handleDeleteEquipment);
  root.querySelector('#adminToggleLockBtn')?.addEventListener('click', handleToggleLock);
  root.querySelector('#adminResetPressBtn')?.addEventListener('click', handleResetPress);
  renderSummary();
}

function selectedEquipment() {
  const select = root.querySelector('#adminPressSelect');
  return presses.find((press) => press.id === select?.value) || null;
}

function renderSummary() {
  const summary = root.querySelector('#adminPressSummary');
  const lockBtn = root.querySelector('#adminToggleLockBtn');
  const nameInput = root.querySelector('#equipmentNameInput');
  const press = selectedEquipment();

  if (!press || !summary || !lockBtn) return;

  const activeCount = (press.slots || []).filter((slot) => slot.partNumber).length;
  summary.textContent = `${equipmentLabel(press)} · ${activeCount} active setups · ${press.areaName ? `Area: ${press.areaName}` : 'Unassigned'} · ${press.isLocked ? `Locked by ${press.lockedBy || 'Admin'}` : 'Unlocked'}`;
  lockBtn.textContent = press.isLocked ? 'Unlock' : 'Lock';
  if (nameInput) nameInput.value = press.equipmentName || '';
}

async function handleCreateEquipment() {
  const input = root.querySelector('#newEquipmentNameInput');
  const name = input?.value.trim();

  if (!name) {
    alert('Enter equipment name first.');
    input?.focus();
    return;
  }

  const nextNumber = presses.length ? Math.max(...presses.map((press) => Number(press.pressNumber || 0))) + 1 : 1;

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

async function handleDeleteEquipment() {
  const press = selectedEquipment();
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

async function handleToggleLock() {
  const press = selectedEquipment();
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

async function handleResetPress() {
  const press = selectedEquipment();
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
