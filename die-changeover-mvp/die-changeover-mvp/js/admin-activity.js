import { watchLogsFromFirestore } from './firestore-logs.js';
import { formatDateTime } from './utils.js';

let root = null;
let unsubscribeLogs = null;

export async function mountActivityTool(container) {
  root = container;
  root.innerHTML = `
    <div>
      <h2>Activity Logs</h2>
      <p class="muted">Recent system actions.</p>
    </div>
    <div id="adminActivityFeed" style="margin-top:16px; display:grid; gap:10px;">
      <div class="muted">Loading activity...</div>
    </div>
  `;

  unsubscribeLogs = watchLogsFromFirestore((liveLogs) => renderLogs(liveLogs.slice(0, 50)));

  return () => {
    if (typeof unsubscribeLogs === 'function') unsubscribeLogs();
    unsubscribeLogs = null;
  };
}

function renderLogs(logs) {
  const feed = root.querySelector('#adminActivityFeed');
  if (!feed) return;

  if (!logs.length) {
    feed.innerHTML = `<div class="muted">No activity yet.</div>`;
    return;
  }

  feed.innerHTML = logs.map((log) => `
    <div class="history-item">
      <strong>${log.user}</strong>
      <div>${log.message}</div>
      <div class="muted">${formatDateTime(log.createdAt)}</div>
    </div>
  `).join('');
}
