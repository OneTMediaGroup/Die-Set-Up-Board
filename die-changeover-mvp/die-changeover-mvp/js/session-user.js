const SESSION_USER_KEY = 'die_set_up_session_user';

export function getStoredSessionUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setStoredSessionUser(user) {
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearStoredSessionUser() {
  localStorage.removeItem(SESSION_USER_KEY);
}
