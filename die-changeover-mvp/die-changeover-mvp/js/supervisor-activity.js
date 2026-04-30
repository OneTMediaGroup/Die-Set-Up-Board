import { watchLogsFromFirestore } from './firestore-logs.js';
import { formatDateTime } from './utils.js';

let root = null;
let logs = [];
let unsubscribeLogs = null;

let searchText = '';
let selectedUser = 'all';

export async function mountSupervisorActivityTool(container) {
  root = container;
  render();

  unsubscribeLogs = watchLogsFromFirestore((liveLogs) => {
    logs = liveLogs.slice(0, 100); // bump to 100 for better scroll
    render();
  });

  return () => {
    if (typeof unsubscribeLogs === 'function') unsubscribeLogs();
    unsubscribeLogs = null;
  };
}

function getUsers() {
  const set = new Set();
  logs.forEach(l => {
    if (l.user) set.add(l.user);
  });
  return Array.from(set).sort();
}

function filteredLogs() {
  return logs.filter((log) => {
    const matchesUser =
      selectedUser === 'all' || (log.user || 'System') === selectedUser;

    const text = `${log.user || ''} ${log.message || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchText.toLowerCase());

    return matchesUser && matchesSearch;
  });
}

function exportCSV(rows) {
  const csv = [
    ['User', 'Message', 'Time'],
    ...rows.map(l => [
      `"${l.user || 'System'}"`,
      `"${(l.message || '').replace(/"/g, '""')}"`,
      `"${formatDateTime(l.createdAt)}"`
    ])
  ].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'activity_feed.csv';
  a.click();

  URL.revokeObjectURL(url);
}

function render() {
  const users = getUsers();
  const rows = filteredLogs();

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Activity Feed</h2>
        <p class="muted">Recent setup, equipment, and operator activity.</p>
      </div>
      <div class="topbar-right">
        <button class="button" id="exportCSV">Export CSV</button>
      </div>
    </div>

    <div class="admin-card">
      <div class="toolbar-row">
        <label>
          Search
          <input id="searchInput" placeholder="Search logs..." value="${searchText}" />
        </label>

        <label>
          User
          <select id="userFilter">
            <option value="all">All Users</option>
            ${users.map(u => `
              <option value="${u}" ${u === selectedUser ? 'selected' : ''}>${u}</option>
            `).join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="admin-card">
      <div class="history-list">
        ${rows.length ? rows.map((log) => `
          <div class="history-item" style="display:grid; gap:6px;">
            
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
              <strong>${log.user || 'System'}</strong>
              <span class="muted" style="font-size:.8rem;">${formatDateTime(log.createdAt)}</span>
            </div>

            <div>${log.message || 'Updated system'}</div>

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

  // events
  const searchInput = root.querySelector('#searchInput');
  const userFilter = root.querySelector('#userFilter');
  const exportBtn = root.querySelector('#exportCSV');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchText = e.target.value;
      render();
    });
  }

  if (userFilter) {
    userFilter.addEventListener('change', (e) => {
      selectedUser = e.target.value;
      render();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportCSV(rows);
    });
  }
}