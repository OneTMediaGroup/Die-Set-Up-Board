import { mountUserSwitcher } from './user-switcher.js';
import { getSession } from './store.js';
import { getStoredSessionUser } from './session-user.js';
import { mountEquipmentTool } from './admin-equipment.js';
import { mountAreasTool } from './admin-areas.js';
import { mountUsersTool } from './admin-users.js';
import { mountActivityTool } from './admin-activity.js';
import { mountSystemTool } from './admin-system.js';

const adminContent = document.getElementById('adminContent');
const currentAdminUser = document.getElementById('currentAdminUser');
const toolButtons = document.querySelectorAll('[data-admin-tool]');

let cleanupCurrentTool = null;

init();

async function init() {
  renderCurrentAdminUser();

  await mountUserSwitcher({
    selectId: 'userSwitcher',
    labelId: 'currentAdminUser',
    allowedRoles: ['admin', 'supervisor', 'dieSetter', 'operator']
  });

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => selectTool(button.dataset.adminTool));
  });

  await selectTool('equipment');
}

function renderCurrentAdminUser() {
  const session = getSession() || getStoredSessionUser();
  if (!currentAdminUser) return;

  const statusText = session?.status && session.status !== 'active' ? ` · ${session.status}` : '';
  currentAdminUser.textContent = session ? `${session.name} · ${session.role}${statusText}` : 'No active user';
}

async function selectTool(toolName) {
  if (!adminContent) return;

  if (typeof cleanupCurrentTool === 'function') {
    cleanupCurrentTool();
    cleanupCurrentTool = null;
  }

  toolButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTool === toolName);
  });

  adminContent.innerHTML = `<div class="admin-loading">Loading...</div>`;

  if (toolName === 'equipment') cleanupCurrentTool = await mountEquipmentTool(adminContent);
  else if (toolName === 'areas') cleanupCurrentTool = await mountAreasTool(adminContent);
  else if (toolName === 'users') cleanupCurrentTool = await mountUsersTool(adminContent);
  else if (toolName === 'activity') cleanupCurrentTool = await mountActivityTool(adminContent);
  else if (toolName === 'system') cleanupCurrentTool = await mountSystemTool(adminContent);
  else adminContent.innerHTML = `<div class="admin-card"><div class="muted">Unknown tool.</div></div>`;
}

window.addEventListener('beforeunload', () => {
  if (typeof cleanupCurrentTool === 'function') cleanupCurrentTool();
});
