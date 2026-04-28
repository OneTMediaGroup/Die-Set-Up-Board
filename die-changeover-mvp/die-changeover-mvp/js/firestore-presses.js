import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function fetchPressesFromFirestore() {
  const snapshot = await getDocs(collection(db, "presses"));
  const presses = [];

  snapshot.forEach((doc) => {
    presses.push({
      id: doc.id,
      ...doc.data()
    });
  });

  presses.sort((a, b) => Number(a.pressNumber || 0) - Number(b.pressNumber || 0));

  return presses;
}

export function watchPressesFromFirestore(callback) {
  return onSnapshot(collection(db, "presses"), (snapshot) => {
    const presses = [];

    snapshot.forEach((doc) => {
      presses.push({
        id: doc.id,
        ...doc.data()
      });
    });

    presses.sort((a, b) => Number(a.pressNumber || 0) - Number(b.pressNumber || 0));

    callback(presses);
  });
}
