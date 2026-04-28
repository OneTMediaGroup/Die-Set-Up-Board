import { watchPressesFromFirestore } from './firestore-presses.js';
import { activeSetupCount, areaLabel, renderPressQueueRow } from './supervisor-helpers.js';

let root = null;
let presses = [];
let unsubscribePresses = null;

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
        <p class="muted">Live supervisor queue, grouped by area and sorted with ready changeovers first.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Equipment</span><strong>${livePresses.length}</strong></div>
        <div class="header-stat"><span>Open Setups</span><strong>${activeSetupCount(livePresses)}</strong></div>
      </div>
    </div>

    ${areaKeys.length ? areaKeys.map((area) => `
      <div class="admin-card">
        <div class="section-header">
          <h2>${area}</h2>
          <div class="muted">${grouped[area].length} equipment</div>
        </div>
        <div class="supervisor-board" style="margin-top:12px;">
          ${grouped[area].map((press) => renderPressQueueRow(press)).join('')}
        </div>
      </div>
    `).join('') : `
      <div class="admin-card"><div class="muted">No equipment loaded yet.</div></div>
    `}
  `;
}
