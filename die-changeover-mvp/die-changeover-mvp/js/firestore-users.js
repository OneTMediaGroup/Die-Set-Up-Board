import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function fetchUsersFromFirestore() {
  const snapshot = await getDocs(collection(db, 'users'));
  const users = [];

  snapshot.forEach((item) => {
    const data = item.data();
    users.push({
      id: item.id,
      ...data,
      status: data.status || (data.isActive === false ? 'inactive' : 'active')
    });
  });

  return users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function updateUserInFirestore(userId, updates) {
  const ref = doc(db, 'users', userId);

  const payload = {
    ...updates,
    isActive: updates.status === 'active',
    updatedAt: new Date().toISOString()
  };

  await updateDoc(ref, payload);
}
