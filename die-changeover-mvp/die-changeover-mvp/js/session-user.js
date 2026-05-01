const SESSION_USER_KEY = 'die_set_up_session_user';

export function getStoredSessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setStoredSessionUser(user) {
  if (!user) {
    clearStoredSessionUser();
    return;
  }

  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearStoredSessionUser() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}