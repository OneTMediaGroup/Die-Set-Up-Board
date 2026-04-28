import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getSession } from './store.js';
import { getStoredSessionUser } from './session-user.js';

export function equipmentLabel(press) {
  return press?.equipmentName || `Press ${press?.pressNumber || ''}`.trim();
}

export function emptySlots() {
  return [1, 2, 3, 4].map(() => ({
    partNumber: '',
    qtyRemaining: 0,
    status: 'next',
    notes: '',
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: ''
  }));
}

export async function addAdminLog(message) {
  const session = getSession() || getStoredSessionUser() || { name: 'Admin' };
  try {
    await addDoc(collection(db, 'logs'), {
      user: session.name || 'Admin',
      message,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Admin log failed:', error);
  }
}
