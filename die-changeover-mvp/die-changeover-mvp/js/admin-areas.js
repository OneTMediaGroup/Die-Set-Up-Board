import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { fetchPressesFromFirestore } from './firestore-press-admin.js';
import { addAdminLog, equipmentLabel } from './admin-helpers.js';

let root = null;
let areas = [];
let presses = [];

export async function mountAreasTool(container) {
  root = container;
  await loadAndRender();
  return () => {};
}

async function loadAndRender() {
  await Promise.all([loadAreas(), loadPresses()]);
  render();
}

async function loadAreas() {
  const snapshot = await getDocs(collection(db, 'areas'));
  areas = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function loadPresses() {
  presses = await fetchPressesFromFirestore();
}

function render() {
  root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <h2>Areas</h2>
        <p class="muted">Organize equipment by department.</p>
      </div>
      <button id="addAreaBtnPanel" class="button primary">Add Area</button>
    </div>

    <div id="areasPanelList" style="margin-top:16px; display:grid; gap:12px;">
      ${renderAreaCards()}
    </div>
  `;

  root.querySelector('#addAreaBtnPanel')?.addEventListener('click', handleAddArea);
  wireAreaButtons();
}

function renderAreaCards() {
  if (!areas.length) {
    return `
      <div class="card">
        <strong>No areas yet</strong>
        <div class="muted">Add your first area like Forming, Welding, or Rolling.</div>
      </div>
    `;
  }

  return `
  ${areas.map((area) => {
    const unassignedPresses = presses.filter((press) => !press.areaId);
    const areaPresses = presses.filter((press) => press.areaId === area.id);

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <strong style="color:${area.color || '#3b82f6'}">${area.name}</strong>
            <div class="muted">Order: ${area.order || 0}</div>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="muted">Color:</span>
            <input
              type="color"
              data-area-color="${area.id}"
              value="${area.color || '#3b82f6'}"
              style="width:36px; height:36px; border:none; padding:0; background:transparent;"
            />
            <button class="button" data-save-area-color="${area.id}">Save</button>
            <button class="button" data-rename-area="${area.id}">Rename</button>
            <button class="button" data-delete-area="${area.id}">Delete</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <label class="muted">Assign equipment to ${area.name}</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
            <select data-area-assign="${area.id}">
              <option value="">Select equipment</option>
              ${unassignedPresses.map((press) => `
                <option value="${press.id}">${equipmentLabel(press)}</option>
              `).join('')}
            </select>

            <button class="button" data-area-assign-btn="${area.id}">
              Assign Equipment
            </button>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; gap:10px;">
          ${
            areaPresses.length
              ? areaPresses.map((press) => `
                <div style="
                  display:flex;
                  justify-content:space-between;
                  align-items:center;
                  gap:12px;
                  flex-wrap:wrap;
                  padding:12px 14px;
                  border:1px solid #e5e7eb;
                  border-left:6px solid ${area.color || '#3b82f6'};
                  border-radius:12px;
                  background:#ffffff;
                ">
                  <div>
                    <strong>${equipmentLabel(press)}</strong>
                    <div class="muted">Area: ${area.name}</div>
                  </div>

                  <button class="button" data-remove-press="${press.id}">
                    Remove
                  </button>
                </div>
              `).join('')
              : `<div class="muted">No equipment assigned yet.</div>`
          }
        </div>
      </div>
    `;
  }).join('')}

  
`;
}






function wireAreaButtons() {
  root.querySelectorAll('[data-area-assign-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.areaAssignBtn;
      const area = areas.find((item) => item.id === areaId);
      const select = root.querySelector(`[data-area-assign="${areaId}"]`);
      if (!select?.value || !area) return alert('Pick equipment first.');

      const press = presses.find((item) => item.id === select.value);
      const label = press ? equipmentLabel(press) : 'Equipment';

      await updateDoc(doc(db, 'presses', select.value), {
        areaId,
        areaName: area.name,
        areaColor: area.color || '#3b82f6',
        updatedAt: new Date().toISOString()
      });
      await addAdminLog(`Assigned ${label} to area ${area.name}`);
      await loadAndRender();
    });
  });

  root.querySelectorAll('[data-remove-press]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const press = presses.find((item) => item.id === btn.dataset.removePress);
      const label = press ? equipmentLabel(press) : 'Equipment';

      await updateDoc(doc(db, 'presses', btn.dataset.removePress), {
        areaId: null,
        areaName: null,
        areaColor: null,
        updatedAt: new Date().toISOString()
      });
      await addAdminLog(`Removed ${label} from area`);
      await loadAndRender();
    });
  });

  root.querySelectorAll('[data-save-area-color]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.saveAreaColor;
      const input = root.querySelector(`[data-area-color="${areaId}"]`);
      const area = areas.find((item) => item.id === areaId);
      if (!input || !area) return;

      await updateDoc(doc(db, 'areas', areaId), {
        color: input.value,
        updatedAt: new Date().toISOString()
      });

      const assigned = presses.filter((press) => press.areaId === areaId);
      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaColor: input.value,
          updatedAt: new Date().toISOString()
        });
      }
      await addAdminLog(`Changed area color for ${area.name}`);
      await loadAndRender();
    });
  });

  root.querySelectorAll('[data-rename-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.renameArea;
      const area = areas.find((item) => item.id === areaId);
      const name = prompt('New area name:', area?.name || '');
      if (!name?.trim()) return;

      await updateDoc(doc(db, 'areas', areaId), {
        name: name.trim(),
        updatedAt: new Date().toISOString()
      });

      const assigned = presses.filter((press) => press.areaId === areaId);
      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaName: name.trim(),
          updatedAt: new Date().toISOString()
        });
      }
      await addAdminLog(`Renamed area ${area?.name || areaId} to ${name.trim()}`);
      await loadAndRender();
    });
  });

  root.querySelectorAll('[data-delete-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.dataset.deleteArea;
      const area = areas.find((item) => item.id === areaId);
      if (!confirm('Delete this area? Equipment will be unassigned.')) return;

      const assigned = presses.filter((press) => press.areaId === areaId);
      for (const press of assigned) {
        await updateDoc(doc(db, 'presses', press.id), {
          areaId: null,
          areaName: null,
          areaColor: null,
          updatedAt: new Date().toISOString()
        });
      }

      await deleteDoc(doc(db, 'areas', areaId));
      await addAdminLog(`Deleted area ${area?.name || areaId}`);
      await loadAndRender();
    });
  });
}

async function handleAddArea() {
  const name = window.prompt('Area name (example: Forming, Welding, Rolling)');
  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, 'areas'), {
      name: name.trim(),
      color: '#3b82f6',
      order: areas.length + 1,
      createdAt: new Date().toISOString()
    });
    await addAdminLog(`Created area ${name.trim()}`);
    await loadAndRender();
  } catch (error) {
    console.error('❌ Failed to add area:', error);
    alert('Add area failed.');
  }
}
