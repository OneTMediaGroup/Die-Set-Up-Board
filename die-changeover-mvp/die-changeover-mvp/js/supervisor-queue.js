import { watchPressesFromFirestore } from './firestore-presses.js';
import { activeSetupCount, areaLabel, renderPressQueueRow } from './supervisor-helpers.js';

let root = null;
let presses = [];
let unsubscribePresses = null;
let expandedPressIds = new Set();

export async function mountQueueTool(container) {
  root = container;
  render([]);

  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses;
    render(presses);
  });

  return () => {
    if (typeof unsubscribePresses === 'function') unsubscribePresses();
    unsubscribePresses = null;
    expandedPressIds = new Set();
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
        <h2>Current Queue</h2>
        <p class="muted">Click equipment to expand and view its 4 slots.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Equipment</span><strong>${livePresses.length}</strong></div>
        <div class="header-stat"><span>Open Setups</span><strong>${activeSetupCount(livePresses)}</strong></div>
      </div>
    </div>

    <div class="admin-card queue-list-card">
      <div class="section-header">
        <div>
          <h2>Areas / Equipment</h2>
          <div class="muted">Single-line equipment list. Expand rows when details are needed.</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="button" id="expandAllQueueBtn">Expand All</button>
          <button class="button" id="collapseAllQueueBtn">Collapse All</button>
        </div>
      </div>

      <div class="queue-area-list" style="margin-top:16px;">
        ${areaKeys.length ? areaKeys.map((area) => `
          <section class="queue-area-section">
            <div class="queue-area-header">
              <h3>${area}</h3>
              <span class="muted">${grouped[area].length} equipment</span>
            </div>
            <div class="queue-equipment-list">
              ${grouped[area]
                .sort((a, b) => String(a.equipmentName || a.pressNumber || '').localeCompare(String(b.equipmentName || b.pressNumber || '')))
                .map((press) => renderPressQueueRow(press, {
                  expanded: expandedPressIds.has(press.id),
                  showAddSetup: false,
                  showMenu: false
                }))
                .join('')}
            </div>
          </section>
        `).join('') : `<div class="muted">No equipment loaded yet.</div>`}
      </div>
    </div>
  `;

  wireQueueClicks();
}

function wireQueueClicks() {
  root.querySelectorAll('[data-toggle-press]').forEach((button) => {
    button.addEventListener('click', () => {
      const pressId = button.dataset.togglePress;
      if (!pressId) return;

      if (expandedPressIds.has(pressId)) expandedPressIds.delete(pressId);
      else expandedPressIds.add(pressId);

      render(presses);
    });
  });

  root.querySelector('#expandAllQueueBtn')?.addEventListener('click', () => {
    expandedPressIds = new Set(presses.map((press) => press.id));
    render(presses);
  });

  root.querySelector('#collapseAllQueueBtn')?.addEventListener('click', () => {
    expandedPressIds = new Set();
    render(presses);
  });
}
