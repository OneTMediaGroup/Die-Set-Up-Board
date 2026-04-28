import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

function normalizeSlots(slots) {
  if (Array.isArray(slots)) return slots;
  return Object.values(slots || {});
}

export async function fetchPressesFromFirestore() {
  const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const snapshot = await getDocs(collection(db, 'presses'));
  const presses = [];

  snapshot.forEach((item) => {
    const data = item.data();
    presses.push({
      id: item.id,
      ...data,
      slots: normalizeSlots(data.slots),
      isLocked: Boolean(data.isLocked)
    });
  });

  return presses.sort((a, b) => Number(a.pressNumber || 0) - Number(b.pressNumber || 0));
}

export async function setPressLockInFirestore({ pressId, isLocked, userName }) {
  const ref = doc(db, 'presses', pressId);

  await updateDoc(ref, {
    isLocked,
    lockedAt: new Date().toISOString(),
    lockedBy: userName,
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: userName
  });
}

export async function archiveAndResetPressInFirestore({ pressId, userName }) {
  const ref = doc(db, 'presses', pressId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error(`Press ${pressId} not found`);
  }

  const press = snap.data();
  const slots = normalizeSlots(press.slots);

  await addDoc(collection(db, 'pressArchives'), {
    pressId,
    pressNumber: press.pressNumber || null,
    area: press.area || '',
    shift: press.shift || '',
    archivedAt: new Date().toISOString(),
    archivedBy: userName,
    previousUpdatedAt: press.updatedAt || null,
    previousLastUpdatedBy: press.lastUpdatedBy || null,
    isLocked: Boolean(press.isLocked),
    slots
  });

  const clearedSlots = slots.map(() => ({
    partNumber: '',
    qtyRemaining: 0,
    status: 'not_running',
    notes: '',
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: userName
  }));

  await updateDoc(ref, {
    slots: clearedSlots,
    isLocked: false,
    lockedAt: null,
    lockedBy: null,
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: userName
  });
}
