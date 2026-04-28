import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔥 Live log watcher (used by Admin Activity panel)
export function watchLogsFromFirestore(callback) {
  const logsRef = collection(db, "logs");

  const q = query(
    logsRef,
    orderBy("createdAt", "desc"),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const logs = [];

    snapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });

    callback(logs);
  });
}