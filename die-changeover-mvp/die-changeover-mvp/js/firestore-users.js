import { db } from './firebase-config.js';
import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function fetchUsersFromFirestore() {
  const snapshot = await getDocs(collection(db, 'users'));
  const users = [];

  snapshot.forEach((doc) => {
    users.push({
      id: doc.id,
      ...doc.data()
    });
  });

  return users
    .filter((user) => user.isActive)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}
