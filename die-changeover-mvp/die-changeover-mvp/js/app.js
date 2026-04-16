import { initStore, setSession, getSession } from './store.js';
import { db } from "./firebase-config.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

initStore();

const demoLoginBtn = document.getElementById('demoLoginBtn');
const sessionText = document.getElementById('sessionText');

async function testWrite() {
  try {
    const docRef = await addDoc(collection(db, "test"), {
      message: "Hello from One T 🔥",
      time: new Date().toISOString()
    });

    console.log("✅ Firestore write success:", docRef.id);
  } catch (e) {
    console.error("❌ Error writing:", e);
  }
}

// run it once
testWrite();


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
