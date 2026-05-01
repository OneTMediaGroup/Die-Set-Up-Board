import { fetchUsersFromFirestore } from './firestore-users.js';
import { setSession, getSession } from './store.js';
import { setStoredSessionUser, clearStoredSessionUser } from './session-user.js';

const LOCK_TIMEOUT = 10 * 60 * 1000;
let lockTimer = null;

export async function requireRoleAccess(allowedRoles = []) {
  const session = getSession();

  if (!session || !allowedRoles.includes(session.role) || session.status === 'inactive') {
    await showLoginModal(allowedRoles);
  }

  startAutoLock(allowedRoles);
}

function startAutoLock(allowedRoles) {
  resetTimer(allowedRoles);

  ['click', 'touchstart', 'keydown'].forEach((event) => {
    window.addEventListener(event, () => resetTimer(allowedRoles), true);
  });
}

function resetTimer(allowedRoles) {
  if (lockTimer) clearTimeout(lockTimer);

  lockTimer = setTimeout(() => {
    clearStoredSessionUser();
    setSession(null);
    showLoginModal(allowedRoles, true);
  }, LOCK_TIMEOUT);
}

async function showLoginModal(allowedRoles, isReauth = false) {
  let modal = document.getElementById('globalLoginModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalLoginModal';
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-content">
        <h3>${isReauth ? 'Session Locked' : 'Login Required'}</h3>
        <p class="muted">Select your name and enter PIN.</p>

        <label class="muted">User</label>
        <select id="loginUser" style="margin-top:6px; width:100%;"></select>

        <label class="muted" style="margin-top:12px; display:block;">PIN</label>
        <input id="loginPin" type="password" inputmode="numeric" placeholder="Enter PIN" style="margin-top:6px; width:100%;" />

        <div id="loginError" class="error-text" style="display:none;"></div>

        <div class="modal-actions">
          <button id="loginConfirm" class="button primary">Login</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  modal.classList.remove('hidden');

  const users = await fetchUsersFromFirestore();
  const validUsers = users.filter((user) => {
    const active = user.status === 'active' || user.isActive === true || !user.status;
    return allowedRoles.includes(user.role) && active && user.pin;
  });

  const select = document.getElementById('loginUser');
  const pinInput = document.getElementById('loginPin');
  const error = document.getElementById('loginError');
  const confirmBtn = document.getElementById('loginConfirm');

  select.innerHTML = validUsers.length
    ? validUsers.map((user) => `<option value="${user.id}">${user.name} (${user.role})</option>`).join('')
    : `<option value="">No authorized users found</option>`;

  pinInput.value = '';
  error.textContent = '';
  error.style.display = 'none';

  setTimeout(() => pinInput.focus(), 100);

  return new Promise((resolve) => {
    const attemptLogin = () => {
      const user = validUsers.find((item) => item.id === select.value);
      const pin = pinInput.value.trim();

      if (!user || String(user.pin) !== pin) {
        error.textContent = 'Invalid PIN';
        error.style.display = 'block';
        pinInput.focus();
        return;
      }

      setSession(user);
      setStoredSessionUser(user);
      modal.classList.add('hidden');
      resetTimer(allowedRoles);
      resolve(user);
    };

    confirmBtn.onclick = attemptLogin;

    pinInput.onkeydown = (event) => {
      if (event.key === 'Enter') attemptLogin();
    };
  });
}