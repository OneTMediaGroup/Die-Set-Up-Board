import { fetchUsersFromFirestore } from './firestore-users.js';

export async function requireRoleAccess(allowedRoles = []) {
  const modal = createLoginModal();
  document.body.appendChild(modal);

  const users = await fetchUsersFromFirestore();

  const allowedUsers = users.filter(u =>
    allowedRoles.includes(u.role) &&
    (u.status === 'active' || u.isActive === true) &&
    u.pin
  );

  const userSelect = modal.querySelector('#authUser');
  const pinInput = modal.querySelector('#authPin');
  const error = modal.querySelector('#authError');

  userSelect.innerHTML = allowedUsers
    .map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`)
    .join('');

  return new Promise((resolve) => {
    modal.querySelector('#authConfirm').onclick = () => {
      const user = allowedUsers.find(u => u.id === userSelect.value);
      const pin = pinInput.value.trim();

      if (!user) {
        showError('Select user');
        return;
      }

      if (!pin || String(user.pin) !== pin) {
        showError('Invalid PIN');
        return;
      }

      modal.remove();
      resolve(user);
    };

    function showError(msg) {
      error.textContent = msg;
      error.style.display = 'block';
    }
  });
}

function createLoginModal() {
  const wrapper = document.createElement('div');
  wrapper.className = 'modal';

  wrapper.innerHTML = `
    <div class="modal-content">
      <h3>Access Required</h3>
      <p class="muted">Enter your credentials to continue.</p>

      <label>User</label>
      <select id="authUser"></select>

      <label style="margin-top:10px;">PIN</label>
      <input id="authPin" type="password" inputmode="numeric" placeholder="Enter PIN" />

      <div id="authError" class="error-text" style="display:none;"></div>

      <div class="modal-actions">
        <button id="authConfirm" class="button primary">Enter</button>
      </div>
    </div>
  `;

  return wrapper;
}