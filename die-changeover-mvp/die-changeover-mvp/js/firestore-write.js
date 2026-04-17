import { db } from './firebase-config.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addLogToFirestore } from './firestore-logs.js';

export async function updateSetupInFirestore({ pressId, slotIndex, setup, userName }) {
  const ref = doc(db, 'presses', pressId);

  const updatePayload = {
    [`slots.${slotIndex}.partNumber`]: setup.partNumber,
    [`slots.${slotIndex}.qtyRemaining`]: setup.qtyRemaining,
    [`slots.${slotIndex}.status`]: setup.status,
    [`slots.${slotIndex}.notes`]: setup.notes,
    [`slots.${slotIndex}.updatedAt`]: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: userName
  };

  await updateDoc(ref, updatePayload);

  await addLogToFirestore({
    user: userName,
    message: `Updated ${pressId.toUpperCase()} Slot ${slotIndex + 1} · ${setup.partNumber || 'Cleared setup'} · ${setup.status}`
  });

  console.log(`✅ Updated ${pressId} slot ${slotIndex}`);
}
