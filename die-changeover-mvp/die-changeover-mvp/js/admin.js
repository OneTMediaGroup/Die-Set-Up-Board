import { initStore, getUsers, saveUsers, getPresses, savePresses, getStatuses, saveStatuses, getLogs, getSession, setSession, appendLog } from './store.js';
import { demoUsers, demoPresses, demoStatuses } from './demo-data.js';
import { formatDateTime } from './utils.js';

initStore();

const currentUserAdmin = document.getElementById('currentUserAdmin');
const usersList = document.getElementById('usersList');
const pressesList = document.getElementById('pressesList');
const statusesList = document.getElementById('statusesList');
const auditLog = document.getElementById('auditLog');

bootstrapSession();
render();
wireEvents();

function bootstrapSession() {
  const session = getSession() || { id: 'u4', name: 'IT Admin', role: 'admin' };
  setSession(session);
  currentUserAdmin.textContent = `${session.name} · ${session.role}`;
}

function render() {
  usersList.innerHTML = getUsers().map((user) => `
    <div class="admin-item"><strong>${user.name}</strong><div class="muted">${user.role}</div></div>
  `).join('');

  pressesList.innerHTML = getPresses().map((press) => `
    <div class="admin-item"><strong>Press ${press.pressNumber}</strong><div class="muted">${press.area} · Shift ${press.shift}</div></div>
  `).join('');

  statusesList.innerHTML = getStatuses().map((status) => `
    <div class="admin-item"><strong>${status.label}</strong><div class="muted">${status.id}</div></div>
  `).join('');

  auditLog.innerHTML = getLogs().slice(0, 20).map((item) => `
    <div class="history-item">
      <strong>${item.user}</strong>
      <div>${item.message}</div>
      <div class="muted">${formatDateTime(item.createdAt)}</div>
    </div>
  `).join('');
}

function wireEvents() {
  document.getElementById('seedUsersBtn').addEventListener('click', () => {
    saveUsers(demoUsers);
    appendLog('IT Admin', 'Seeded demo users');
    render();
  });
  document.getElementById('seedPressesBtn').addEventListener('click', () => {
    savePresses(demoPresses);
    appendLog('IT Admin', 'Seeded demo presses');
    render();
  });
  document.getElementById('seedStatusesBtn').addEventListener('click', () => {
    saveStatuses(demoStatuses);
    appendLog('IT Admin', 'Seeded demo statuses');
    render();
  });
  document.getElementById('refreshAdminBtn').addEventListener('click', render);
}
