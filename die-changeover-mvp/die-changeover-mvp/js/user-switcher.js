import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { fetchActiveUsersFromFirestore } from './firestore-users.js';

export async function mountUserSwitcher({
  selectId = 'userSwitcher',
  labelId = null,
  allowedRoles = null
} = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    let users = await fetchActiveUsersFromFirestore();

    if (Array.isArray(allowedRoles) && allowedRoles.length) {
      users = users.filter((user) => allowedRoles.includes(user.role));
    }

    const current = getSession() || getStoredSessionUser();

    select.innerHTML = users.map((user) => `
      <option value="${user.id}">
        ${user.name} · ${user.role}
      </option>
    `).join('');

    if (current?.id && users.some((user) => user.id === current.id)) {
      select.value = current.id;
    } else if (users[0]) {
      select.value = users[0].id;
      setSession(users[0]);
      setStoredSessionUser(users[0]);
    }

    renderSelectedUserLabel(select, users, labelId);

    select.addEventListener('change', () => {
      const picked = users.find((user) => user.id === select.value);
      if (!picked) return;

      setSession(picked);
      setStoredSessionUser(picked);
      renderSelectedUserLabel(select, users, labelId);
      window.location.reload();
    });
  } catch (error) {
    console.error('❌ Failed to mount user switcher:', error);
    select.innerHTML = `<option value="">User load failed</option>`;
  }
}

function renderSelectedUserLabel(select, users, labelId) {
  if (!labelId) return;

  const label = document.getElementById(labelId);
  if (!label) return;

  const picked = users.find((user) => user.id === select.value);
  if (!picked) {
    label.textContent = 'No active user';
    return;
  }

  label.textContent = `${picked.name} · ${picked.role}`;
}
