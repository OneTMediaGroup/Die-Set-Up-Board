import { initStore, getSession } from './store.js';
import { requireRoleAccess } from './auth-lock.js';

import { mountQueueTool } from './supervisor-queue.js';
import { mountAreaViewTool } from './supervisor-areas.js';
import { mountSupervisorActivityTool } from './supervisor-activity.js';

initStore();

await requireRoleAccess(['supervisor', 'admin']);

const currentUserSupervisor = document.getElementById('currentUserSupervisor');
const supervisorContent = document.getElementById('supervisorContent');
const toolButtons = document.querySelectorAll('[data-supervisor-tool]');

let cleanupCurrentTool = null;

init();

async function init() {
  renderCurrentUser();

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => selectTool(button.dataset.supervisorTool));
  });

  await selectTool('queue');
}

function renderCurrentUser() {
  const session = getSession();
  if (!currentUserSupervisor) return;

  const statusText = session?.status && session.status !== 'active' ? ` · ${session.status}` : '';
  currentUserSupervisor.textContent = session ? `${session.name} · ${session.role}${statusText}` : 'Locked';
}

async function selectTool(toolName) {
  if (!supervisorContent) return;

  if (typeof cleanupCurrentTool === 'function') {
    cleanupCurrentTool();
    cleanupCurrentTool = null;
  }

  toolButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.supervisorTool === toolName);
  });

  supervisorContent.innerHTML = `<div class="admin-loading">Loading...</div>`;

  if (toolName === 'queue') cleanupCurrentTool = await mountQueueTool(supervisorContent);
  else if (toolName === 'areas') cleanupCurrentTool = await mountAreaViewTool(supervisorContent);
  else if (toolName === 'activity') cleanupCurrentTool = await mountSupervisorActivityTool(supervisorContent);
  else supervisorContent.innerHTML = `<div class="admin-card"><div class="muted">Unknown supervisor tool.</div></div>`;
}

window.addEventListener('beforeunload', () => {
  if (typeof cleanupCurrentTool === 'function') cleanupCurrentTool();
});