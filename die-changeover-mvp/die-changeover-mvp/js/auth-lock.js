import { fetchUsersFromFirestore } from './firestore-users.js';
import { setSession, getSession } from './store.js';

const LOCK_TIMEOUT = 10 * 60 * 1000; // 10 minutes
let lockTimer = null;
let lastActivity = Date.now();

/* ============================= */
/* PUBLIC ENTRY */
/* ============================= */

export async function requireRoleAccess(allowedRoles = []) {
  const session = getSession();

  if (!session || !allowedRoles.includes(session.role)) {
    await showLoginModal(allowedRoles);
  }

  startAutoLock();
}

/* ============================= */
/* AUTO LOCK SYSTEM */
/* ============================= */

function startAutoLock() {
  resetTimer();

  ['click', 'touchstart', 'keydown'].forEach((event) => {
    window.addEventListener(event, resetTimer, true);
  });
}

function resetTimer() {
  lastActivity = Date.now();

  if (lockTimer) clearTimeout(lockTimer);

  lockTimer = setTimeout(() => {
    lockScreen();
  }, LOCK_TIMEOUT);
}

function lockScreen() {
  showLoginModal(['admin', 'supervisor', 'dieSetter'], true);
}

/* ============================= */
/* LOGIN MODAL */
/* ============================= */

async function showLoginModal(allowedRoles, isReauth = false) {
  let modal = document.getElementById('globalLoginModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalLoginModal';
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-content">
        <h3>${isReauth ? 'Session Locked' : 'Login Required'}</h3>
        <p class="muted">Enter your name and PIN</p>

        <select id="loginUser"></select>
        <input id="loginPin" type="password" placeholder="Enter PIN" />

        <div id="loginError" class="error-text"></div>

        <div class="modal-actions">
          <button id="loginConfirm" class="button primary">Login</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  modal.classList.remove('hidden');

  const users = await fetchUsersFromFirestore();

  const validUsers = users.filter(
    (u) => allowedRoles.includes(u.role) && u.pin
  );

  const select = document.getElementById('loginUser');
  const pinInput = document.getElementById('loginPin');
  const error = document.getElementById('loginError');

  select.innerHTML = validUsers
    .map((u) => `<option value="${u.id}">${u.name} (${u.role})</option>`)
    .join('');

  pinInput.value = '';
  error.textContent = '';

  document.getElementById('loginConfirm').onclick = () => {
    const user = validUsers.find((u) => u.id === select.value);
    const pin = pinInput.value.trim();

    if (!user || String(user.pin) !== pin) {
      error.textContent = 'Invalid PIN';
      return;
    }

    setSession(user);
    modal.classList.add('hidden');

    resetTimer(); // 🔥 restart timer after login
  };
}