import { watchLogsFromFirestore } from './firestore-logs.js';
import { formatDateTime } from './utils.js';

let root = null;
let unsubscribeLogs = null;
let logs = [];

let searchText = '';
let dateFrom = '';
let dateTo = '';
let areaFilter = 'all';
let equipmentFilter = 'all';

export async function mountActivityTool(container) {
  root = container;
  render();

  unsubscribeLogs = watchLogsFromFirestore((liveLogs) => {
    logs = liveLogs || [];
    render();
  });

  return () => {
    if (typeof unsubscribeLogs === 'function') unsubscribeLogs();
    unsubscribeLogs = null;
  };
}

/* ---------- FILTER LOGIC ---------- */

function extractArea(log) {
  const msg = log.message || '';
  const match = msg.match(/area\s(.+)/i);
  return match ? match[1] : '';
}

function extractEquipment(log) {
  const msg = log.message || '';
  const match = msg.match(/(Press\s\d+|equipment\s.+?)(\s|$)/i);
  return match ? match[1] : '';
}

function filteredLogs() {
  return logs.filter((log) => {
    const text = `${log.user} ${log.message}`.toLowerCase();

    const matchesSearch =
      !searchText ||
      text.includes(searchText.toLowerCase());

    const logDate = log.createdAt ? new Date(log.createdAt) : null;

    const matchesFrom = !dateFrom || (logDate && logDate >= new Date(dateFrom));
    const matchesTo = !dateTo || (logDate && logDate <= new Date(dateTo + 'T23:59:59'));

    const area = extractArea(log);
    const equipment = extractEquipment(log);

    const matchesArea = areaFilter === 'all' || area.includes(areaFilter);
    const matchesEquipment = equipmentFilter === 'all' || equipment.includes(equipmentFilter);

    return matchesSearch && matchesFrom && matchesTo && matchesArea && matchesEquipment;
  });
}

/* ---------- UNIQUE FILTER OPTIONS ---------- */

function getUniqueAreas() {
  return [...new Set(logs.map(extractArea).filter(Boolean))];
}

function getUniqueEquipment() {
  return [...new Set(logs.map(extractEquipment).filter(Boolean))];
}

/* ---------- RENDER ---------- */

function render() {
  const visibleLogs = filteredLogs();

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Activity Logs</h2>
        <p class="muted">Search, filter, and export system activity.</p>
      </div>
      <button id="exportLogsBtn" class="button primary">Export CSV</button>
    </div>

    <div class="admin-card">
      <div style="display:grid; gap:10px; margin-bottom:12px;">
        
        <input id="searchInput" value="${escapeAttr(searchText)}" placeholder="Search logs..." />

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input type="date" id="dateFrom" value="${dateFrom}" />
          <input type="date" id="dateTo" value="${dateTo}" />

          <select id="areaFilter">
            <option value="all">All Areas</option>
            ${getUniqueAreas().map(a => `<option value="${a}" ${a === areaFilter ? 'selected' : ''}>${a}</option>`).join('')}
          </select>

          <select id="equipmentFilter">
            <option value="all">All Equipment</option>
            ${getUniqueEquipment().map(e => `<option value="${e}" ${e === equipmentFilter ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>

        <div class="muted">${visibleLogs.length} shown · ${logs.length} total</div>
      </div>

      <div style="display:grid; gap:10px;">
        ${renderLogs(visibleLogs)}
      </div>
    </div>

    
  `;

  wireEvents();
}

/* ---------- LOG RENDER ---------- */

function renderLogs(list) {
  if (!list.length) return `<div class="muted">No activity found.</div>`;

  return list.map((log) => `
    <div class="history-item" style="border-left:4px solid #3b82f6;">
      <strong>${escapeHtml(log.user || 'System')}</strong>
      <div>${escapeHtml(log.message)}</div>
      <div class="muted">${formatDateTime(log.createdAt)}</div>
    </div>
  `).join('');
}

/* ---------- EVENTS ---------- */

function wireEvents() {
  root.querySelector('#searchInput')?.addEventListener('input', e => {
    searchText = e.target.value;
    render();
  });

  root.querySelector('#dateFrom')?.addEventListener('change', e => {
    dateFrom = e.target.value;
    render();
  });

  root.querySelector('#dateTo')?.addEventListener('change', e => {
    dateTo = e.target.value;
    render();
  });

  root.querySelector('#areaFilter')?.addEventListener('change', e => {
    areaFilter = e.target.value;
    render();
  });

  root.querySelector('#equipmentFilter')?.addEventListener('change', e => {
    equipmentFilter = e.target.value;
    render();
  });

  root.querySelector('#exportLogsBtn')?.addEventListener('click', exportCsv);
}

/* ---------- EXPORT ---------- */

function exportCsv() {
  const rows = filteredLogs();

  const csv = [
    ['User', 'Message', 'Created At'],
    ...rows.map(log => [log.user, log.message, formatDateTime(log.createdAt)])
  ].map(row => row.map(csvEscape).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

/* ---------- HELPERS ---------- */

function csvEscape(value) {
  return `"${String(value || '').replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}