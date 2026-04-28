import { watchPressesFromFirestore } from './firestore-presses.js';
import { activeSetupCount, areaLabel, equipmentLabel, getSlotsArray } from './supervisor-helpers.js';

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
        <p class="muted">Supervisor overview by department or production area.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Areas</span><strong>${areaKeys.length}</strong></div>
        <div class="header-stat"><span>Setups</span><strong>${activeSetupCount(livePresses)}</strong></div>
      </div>
    </div>

    <div class="admin-table-card admin-card">
      <div class="admin-table-title">Areas</div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Equipment</th>
              <th>Active Setups</th>
              <th>Ready</th>
              <th>Locked</th>
            </tr>
          </thead>
          <tbody>
            ${areaKeys.length ? areaKeys.map((area) => {
              const areaPresses = grouped[area];
              const active = areaPresses.flatMap((press) => getSlotsArray(press)).filter((slot) => slot.partNumber).length;
              const ready = areaPresses.flatMap((press) => getSlotsArray(press)).filter((slot) => slot.status === 'ready_for_changeover').length;
              const locked = areaPresses.filter((press) => press.isLocked).length;

              return `
                <tr>
                  <td><strong>${area}</strong></td>
                  <td>${areaPresses.length}</td>
                  <td>${active}</td>
                  <td>${ready}</td>
                  <td>${locked}</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="5" class="muted">No areas found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    ${areaKeys.map((area) => `
      <div class="admin-card">
        <div class="section-header">
          <h2>${area}</h2>
          <div class="muted">${grouped[area].length} equipment</div>
        </div>
        <div style="display:grid; gap:10px; margin-top:12px;">
          ${grouped[area].map((press) => {
            const slots = getSlotsArray(press);
            const active = slots.filter((slot) => slot.partNumber).length;
            const ready = slots.filter((slot) => slot.status === 'ready_for_changeover').length;
            return `
              <div class="queue-card" style="border-left:6px solid ${press.areaColor || '#3b82f6'};">
                <strong>${equipmentLabel(press)}</strong>
                <div class="muted">${active} active setups · ${ready} ready · ${press.isLocked ? 'Locked' : 'Unlocked'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('')}
  `;
}
