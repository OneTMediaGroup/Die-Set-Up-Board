import { watchPressesFromFirestore } from './firestore-presses.js';
import { activeSetupCount, areaLabel, equipmentLabel, getSlotsArray } from './supervisor-helpers.js';
import { normalizedSlotStatus, statusLabel } from './utils.js';

let root = null;
let presses = [];
let unsubscribePresses = null;

export async function mountAreaViewTool(container) {
  root = container;
  render([]);

  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    render(presses);
  });

  return () => {
    if (typeof unsubscribePresses === 'function') unsubscribePresses();
    unsubscribePresses = null;
  };
}

function getSlotStatus(slot, slotIndex) {
  if (!slot?.partNumber) return 'no_setup';
  return normalizedSlotStatus(slot.status, slotIndex, true);
}

function getAreaStatus(areaPresses) {
  const slots = areaPresses.flatMap((press) => getSlotsArray(press));

  if (!slots.some((slot) => slot.partNumber)) return 'no_setup';
  if (slots.some((slot, index) => getSlotStatus(slot, index) === 'blocked')) return 'blocked';
  if (slots.some((slot, index) => getSlotStatus(slot, index) === 'change_in_progress')) return 'change_in_progress';
  if (slots.some((slot, index) => getSlotStatus(slot, index) === 'ready')) return 'ready';

  return 'current';
}

function getAreaStats(areaPresses) {
  const slots = areaPresses.flatMap((press) => getSlotsArray(press));
  const active = slots.filter((slot) => slot.partNumber).length;
  const ready = slots.filter((slot, index) => getSlotStatus(slot, index) === 'ready').length;
  const blocked = slots.filter((slot, index) => getSlotStatus(slot, index) === 'blocked').length;
  const locked = areaPresses.filter((press) => press.isLocked).length;

  return { active, ready, blocked, locked };
}

function render(livePresses) {
  const grouped = livePresses.reduce((groups, press) => {
    const label = areaLabel(press);
    if (!groups[label]) groups[label] = [];
    groups[label].push(press);
    return groups;
  }, {});

  const areaKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Area View</h2>
        <p class="muted">At-a-glance supervisor overview by department or production area.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Areas</span><strong>${areaKeys.length}</strong></div>
        <div class="header-stat"><span>Setups</span><strong>${activeSetupCount(livePresses)}</strong></div>
      </div>
    </div>

    <div class="admin-table-card admin-card">
      <div class="admin-table-title">Area Summary</div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Status</th>
              <th>Equipment</th>
              <th>Active Setups</th>
              <th>Ready</th>
              <th>Blocked</th>
              <th>Locked</th>
            </tr>
          </thead>
          <tbody>
            ${areaKeys.length ? areaKeys.map((area) => {
              const areaPresses = grouped[area];
              const areaStatus = getAreaStatus(areaPresses);
              const stats = getAreaStats(areaPresses);

              return `
                <tr>
                  <td><strong>${escapeHtml(area)}</strong></td>
                  <td><span class="status-pill ${areaStatus}">${statusLabel(areaStatus)}</span></td>
                  <td>${areaPresses.length}</td>
                  <td>${stats.active}</td>
                  <td>${stats.ready}</td>
                  <td>${stats.blocked}</td>
                  <td>${stats.locked}</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="7" class="muted">No areas found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    ${areaKeys.map((area) => {
      const areaPresses = grouped[area];
      const areaStatus = getAreaStatus(areaPresses);
      const stats = getAreaStats(areaPresses);
      const areaColor = areaPresses[0]?.areaColor || '#3b82f6';

      return `
        <div class="admin-card area-overview-card" style="border-left:8px solid ${areaColor};">
          <div class="section-header">
            <div>
              <h2>${escapeHtml(area)}</h2>
              <div class="muted">
                ${areaPresses.length} equipment · ${stats.active} active · ${stats.ready} ready · ${stats.blocked} blocked
              </div>
            </div>
            <span class="status-pill ${areaStatus}">${statusLabel(areaStatus)}</span>
          </div>

          <div style="display:grid; gap:10px; margin-top:14px;">
            ${areaPresses
              .sort((a, b) => String(equipmentLabel(a)).localeCompare(String(equipmentLabel(b)), undefined, { numeric: true }))
              .map((press) => renderAreaEquipmentCard(press))
              .join('')}
          </div>
        </div>
      `;
    }).join('')}

    <div class="muted" style="margin-top:16px; text-align:center;">
      © One T Media Group
    </div>
  `;

  wireAreaClicks();
}

function renderAreaEquipmentCard(press) {
  const slots = getSlotsArray(press);
  const active = slots.filter((slot) => slot.partNumber).length;
  const ready = slots.filter((slot, index) => getSlotStatus(slot, index) === 'ready').length;
  const blocked = slots.filter((slot, index) => getSlotStatus(slot, index) === 'blocked').length;

  return `
    <button
      type="button"
      class="queue-card area-equipment-card"
      data-jump-equipment="${press.id}"
      style="border-left:6px solid ${press.areaColor || '#3b82f6'}; text-align:left; cursor:pointer;"
    >
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div>
          <strong>${escapeHtml(equipmentLabel(press))}</strong>
          <div class="muted">${active} active · ${ready} ready · ${blocked} blocked · ${press.isLocked ? 'Locked' : 'Unlocked'}</div>
        </div>
        <div class="muted">Open in Queue →</div>
      </div>
    </button>
  `;
}

function wireAreaClicks() {
  root.querySelectorAll('[data-jump-equipment]').forEach((button) => {
    button.addEventListener('click', () => {
      const pressId = button.dataset.jumpEquipment;
      if (!pressId) return;

      document.querySelector('[data-supervisor-tool="queue"]')?.click();

      setTimeout(() => {
        const target =
          document.querySelector(`[data-toggle-press="${pressId}"]`) ||
          document.querySelector(`[data-save-slot="${pressId}"]`);

        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
    });
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}