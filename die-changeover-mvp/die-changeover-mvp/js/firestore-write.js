import { db } from './firebase-config.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addLogToFirestore } from './firestore-logs.js';

function statusLabel(status) {
  const labels = {
    not_running: 'Not Running',
    running: 'Running',
    change_in_progress: 'In Progress',
    change_complete: 'Complete',
    blocked: 'Blocked / Maintenance'
  };

  return labels[status] || status;
}

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

  const message = setup.partNumber
    ? `Updated ${pressId.toUpperCase()} Slot ${slotIndex + 1} · ${setup.partNumber} · ${statusLabel(setup.status)}`
    : `Cleared ${pressId.toUpperCase()} Slot ${slotIndex + 1}`;

  await addLogToFirestore({
    user: userName,
    message
  });

  console.log(`✅ Updated ${pressId} slot ${slotIndex}`);
}
