import { getSession } from './store.js';

export function getUserRole() {
  const session = getSession();
  return session?.role || 'guest';
}

export function isDieSetter() {
  return getUserRole() === 'dieSetter';
}

export function isSupervisor() {
  return getUserRole() === 'supervisor';
}

export function isAdmin() {
  return getUserRole() === 'admin';
}
