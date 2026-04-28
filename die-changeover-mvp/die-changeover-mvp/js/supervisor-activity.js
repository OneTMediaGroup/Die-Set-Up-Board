import { watchLogsFromFirestore } from './firestore-logs.js';
import { formatDateTime } from './utils.js';

let root = null;
let logs = [];
let unsubscribeLogs = null;

export async function mountSupervisorActivityTool(container) {
  root = container;
  render();

  unsubscribeLogs = watchLogsFromFirestore((liveLogs) => {
    logs = liveLogs.slice(0, 50);
    render();
  });

  return () => {
    if (typeof unsubscribeLogs === 'function') unsubscribeLogs();
    unsubscribeLogs = null;
  };
}

function render() {
  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Activity Feed</h2>
        <p class="muted">Recent setup, equipment, and operator activity.</p>
      </div>
    </div>

    <div class="admin-card">
      <div class="history-list">
        ${logs.length ? logs.map((log) => `
          <div class="history-item">
            <strong>${log.user || 'System'}</strong>
            <div>${log.message || 'Updated system'}</div>
            <div class="muted">${formatDateTime(log.createdAt)}</div>
          </div>
        `).join('') : `
          <div class="history-item">
            <strong>No activity yet</strong>
            <div>Recent plant floor activity will appear here.</div>
          </div>
        `}
      </div>
    </div>
  `;
}
