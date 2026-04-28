import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function addLogToFirestore({ user, message }) {
  await addDoc(collection(db, 'logs'), {
    user,
    message,
    createdAt: new Date().toISOString()
  });
}

export function watchLogsFromFirestore(callback) {
  const logsQuery = query(
    collection(db, 'logs'),
    orderBy('createdAt', 'desc'),
    limit(25)
  );

  return onSnapshot(logsQuery, (snapshot) => {
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    callback(logs);
  });
}
