import { requireRoleAccess } from './auth-lock.js';

await requireRoleAccess(['supervisor', 'admin']);

import { initStore, getSession, setSession } from './store.js';
import { fetchUsersFromFirestore } from './firestore-users.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';


import { mountQueueTool } from './supervisor-queue.js';
import { mountAreaViewTool } from './supervisor-areas.js';
import { mountSupervisorActivityTool } from './supervisor-activity.js';

initStore();

const currentUserSupervisor = document.getElementById('currentUserSupervisor');
const supervisorContent = document.getElementById('supervisorContent');
const toolButtons = document.querySelectorAll('[data-supervisor-tool]');

let cleanupCurrentTool = null;

init();

async function init() {
  await bootstrapSession();

 

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => selectTool(button.dataset.supervisorTool));
  });

  await selectTool('queue');
}

async function bootstrapSession() {
  const storedUser = getStoredSessionUser();

  if (storedUser && (storedUser.role === 'supervisor' || storedUser.role === 'admin')) {
    setSession(storedUser);
    renderCurrentUser();
    return;
  }

  try {
    const users = await fetchUsersFromFirestore();
    const defaultUser =
      users.find((user) => user.role === 'supervisor') ||
      users.find((user) => user.role === 'admin') || {
        id: 'u2',
        name: 'Sully T.',
        role: 'supervisor',
        status: 'active'
      };

    setStoredSessionUser(defaultUser);
    setSession(defaultUser);
  } catch (error) {
    console.error('❌ Failed loading supervisor users:', error);
    setSession({ id: 'u2', name: 'Sully T.', role: 'supervisor', status: 'active' });
  }

  renderCurrentUser();
}

function renderCurrentUser() {
  const session = getSession() || getStoredSessionUser();
  if (!currentUserSupervisor) return;

  const statusText = session?.status && session.status !== 'active' ? ` · ${session.status}` : '';
  currentUserSupervisor.textContent = session ? `${session.name} · ${session.role}${statusText}` : 'No active user';
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
