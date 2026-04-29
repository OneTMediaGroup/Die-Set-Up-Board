import { db } from "./firebase-config.js";
import { demoPresses } from "./demo-data.js";
import {
  collection,
  getDocs,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function seedPresses() {
  try {
    const snapshot = await getDocs(collection(db, "presses"));

    if (!snapshot.empty) {
      console.log("ℹ️ Presses already seeded. Skipping.");
      return;
    }

    for (const press of demoPresses) {
      await setDoc(doc(db, "presses", press.id), {
        ...press,
        updatedAt: new Date().toISOString()
      });
    }

    console.log("✅ Presses seeded to Firestore");
  } catch (error) {
    console.error("❌ Error seeding presses:", error);
  }
}

// seedPresses disabled
