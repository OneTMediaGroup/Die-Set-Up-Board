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
    presses.push(doc.data());
  });

  presses.sort((a, b) => a.pressNumber - b.pressNumber);

  return presses;
}

export function watchPressesFromFirestore(callback) {
  return onSnapshot(collection(db, "presses"), (snapshot) => {
    const presses = [];

    snapshot.forEach((doc) => {
      presses.push(doc.data());
    });

    presses.sort((a, b) => a.pressNumber - b.pressNumber);

    callback(presses);
  });
}
