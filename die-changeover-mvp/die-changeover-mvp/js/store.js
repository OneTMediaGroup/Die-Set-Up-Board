import { demoPresses, demoUsers, demoStatuses, demoAuditLog } from './demo-data.js';

const KEYS = {
  session: 'die_changeover_session',
  presses: 'die_changeover_presses',
  users: 'die_changeover_users',
  statuses: 'die_changeover_statuses',
  logs: 'die_changeover_logs'
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedIfMissing() {
  if (!localStorage.getItem(KEYS.presses)) localStorage.setItem(KEYS.presses, JSON.stringify(demoPresses));
  if (!localStorage.getItem(KEYS.users)) localStorage.setItem(KEYS.users, JSON.stringify(demoUsers));
  if (!localStorage.getItem(KEYS.statuses)) localStorage.setItem(KEYS.statuses, JSON.stringify(demoStatuses));
  if (!localStorage.getItem(KEYS.logs)) localStorage.setItem(KEYS.logs, JSON.stringify(demoAuditLog));
}

export function initStore() {
  seedIfMissing();
}

export function getSession() {
  return JSON.parse(sessionStorage.getItem(KEYS.session) || 'null');
}

export function setSession(session) {
  if (!session) {
    sessionStorage.removeItem(KEYS.session);
    localStorage.removeItem(KEYS.session);
    return;
  }

  sessionStorage.setItem(KEYS.session, JSON.stringify(session));
  localStorage.removeItem(KEYS.session);
}

export function getPresses() {
  return clone(JSON.parse(localStorage.getItem(KEYS.presses) || '[]'));
}

export function savePresses(presses) {
  localStorage.setItem(KEYS.presses, JSON.stringify(presses));
}

export function getUsers() {
  return clone(JSON.parse(localStorage.getItem(KEYS.users) || '[]'));
}

export function saveUsers(users) {
  localStorage.setItem(KEYS.users, JSON.stringify(users));
}

export function getStatuses() {
  return clone(JSON.parse(localStorage.getItem(KEYS.statuses) || '[]'));
}

export function saveStatuses(statuses) {
  localStorage.setItem(KEYS.statuses, JSON.stringify(statuses));
}

export function getLogs() {
  return clone(JSON.parse(localStorage.getItem(KEYS.logs) || '[]'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
} 

export function appendLog(user, message) {
  const logs = getLogs();
  logs.unshift({
    id: crypto.randomUUID(),
    user,
    message,
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(KEYS.logs, JSON.stringify(logs));
}

export function upsertSetup({ pressId, slotIndex, setup, userName }) {
  const presses = getPresses();
  const press = presses.find((p) => p.id === pressId);
  if (!press) throw new Error('Press not found');
  press.slots[slotIndex] = {
    ...press.slots[slotIndex],
    ...setup,
    updatedAt: new Date().toISOString()
  };
  savePresses(presses);
  appendLog(userName, `Updated ${press.equipmentName || `Press ${press.pressNumber}`} Slot ${slotIndex + 1}`);
}

export function clearSetup({ pressId, slotIndex, userName }) {
  upsertSetup({
    pressId,
    slotIndex,
    userName,
    setup: {
      partNumber: '',
      qtyRemaining: 0,
      status: 'next',
      notes: ''
    }
  });
  appendLog(userName, `Cleared Press ${pressId.replace('p','')} Slot ${slotIndex + 1}`);
}

export function resetAll() {
  localStorage.removeItem(KEYS.presses);
  localStorage.removeItem(KEYS.users);
  localStorage.removeItem(KEYS.statuses);
  localStorage.removeItem(KEYS.logs);
  seedIfMissing();
}
