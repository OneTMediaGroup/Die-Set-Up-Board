import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function fetchUsersFromFirestore() {
  const snapshot = await getDocs(collection(db, 'users'));
  const users = [];

  snapshot.forEach((docSnap) => {
    users.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  return users
    .filter((user) => user.isActive)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function watchUsersFromFirestore(callback) {
  const usersQuery = query(collection(db, 'users'), orderBy('name'));

  return onSnapshot(usersQuery, (snapshot) => {
    const users = [];

    snapshot.forEach((docSnap) => {
      users.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    callback(users);
  });
}

export async function updateUserInFirestore(userId, updates) {
  const ref = doc(db, 'users', userId);
  await updateDoc(ref, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}
