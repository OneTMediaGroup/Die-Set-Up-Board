import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function updateSetupInFirestore({ pressId, slotIndex, setup, userName }) {
  try {
    const ref = doc(db, "presses", pressId);

    const updatePayload = {
      [`slots.${slotIndex}.partNumber`]: setup.partNumber,
      [`slots.${slotIndex}.qtyRemaining`]: setup.qtyRemaining,
      [`slots.${slotIndex}.status`]: setup.status,
      [`slots.${slotIndex}.notes`]: setup.notes,
      [`slots.${slotIndex}.updatedAt`]: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await updateDoc(ref, updatePayload);

    console.log(`✅ Updated ${pressId} slot ${slotIndex}`);
  } catch (e) {
    console.error("❌ Firestore update failed:", e);
  }
}
