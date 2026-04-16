import { initStore, setSession, getSession } from './store.js';

initStore();

const demoLoginBtn = document.getElementById('demoLoginBtn');
const sessionText = document.getElementById('sessionText');

function renderSession() {
  const session = getSession();
  sessionText.textContent = session ? `Current session: ${session.name} (${session.role})` : 'No active session yet';
}

if (demoLoginBtn) {
  demoLoginBtn.addEventListener('click', () => {
    setSession({ id: 'u2', name: 'Sully T.', role: 'supervisor' });
    renderSession();
  });
}

renderSession();
