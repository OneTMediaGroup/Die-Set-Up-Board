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

function buildLogMessage({ pressId, slotIndex, setup, previousSetup }) {
  const pressCode = pressId.toUpperCase();
  const slotText = `Slot ${slotIndex + 1}`;
  const hasPart = Boolean(setup.partNumber);
  const previousStatus = previousSetup?.status || 'not_running';
  const newStatus = setup.status || 'not_running';

  if (!hasPart) {
    return `Cleared ${pressCode} ${slotText}`;
  }

  if (!previousSetup?.partNumber) {
    return `Loaded ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining}`;
  }

  if (previousStatus !== newStatus) {
    if (newStatus === 'blocked') {
      return `Blocked ${pressCode} ${slotText} · ${setup.partNumber} · ${setup.notes || 'No reason added'}`;
    }

    if (newStatus === 'change_complete') {
      return `Completed ${pressCode} ${slotText} · ${setup.partNumber}`;
    }

    if (newStatus === 'change_in_progress') {
      return `Started change ${pressCode} ${slotText} · ${setup.partNumber}`;
    }

    if (newStatus === 'running') {
      return `Running ${pressCode} ${slotText} · ${setup.partNumber}`;
    }

    return `Updated status ${pressCode} ${slotText} · ${setup.partNumber} · ${statusLabel(newStatus)}`;
  }

  const qtyChanged = Number(previousSetup?.qtyRemaining || 0) !== Number(setup.qtyRemaining || 0);
  const notesChanged = (previousSetup?.notes || '') !== (setup.notes || '');
  const partChanged = (previousSetup?.partNumber || '') !== (setup.partNumber || '');

  if (partChanged) {
    return `Changed setup ${pressCode} ${slotText} · ${previousSetup?.partNumber || '—'} → ${setup.partNumber}`;
  }

  if (qtyChanged && notesChanged) {
    return `Updated ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining} + notes`;
  }

  if (qtyChanged) {
    return `Updated qty ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining}`;
  }

  if (notesChanged) {
    return `Updated notes ${pressCode} ${slotText} · ${setup.partNumber}`;
  }

  return `Updated ${pressCode} ${slotText} · ${setup.partNumber} · ${statusLabel(newStatus)}`;
}

export async function updateSetupInFirestore({ pressId, slotIndex, setup, userName }) {
  const ref = doc(db, 'presses', pressId);
  const now = new Date().toISOString();

  // Read current in-memory state from the page if available via Firestore listener write pattern is not available here,
  // so we store a minimal previous snapshot from the setup payload caller when possible.
  // Since callers currently do not pass previous state, we will infer best-effort messages from status + payload.
  const previousSetup = setup.previousSetup || null;

  const updatePayload = {
    [`slots.${slotIndex}.partNumber`]: setup.partNumber,
    [`slots.${slotIndex}.qtyRemaining`]: setup.qtyRemaining,
    [`slots.${slotIndex}.status`]: setup.status,
    [`slots.${slotIndex}.notes`]: setup.notes,
    [`slots.${slotIndex}.updatedAt`]: now,
    [`slots.${slotIndex}.lastUpdatedBy`]: userName,
    updatedAt: now,
    lastUpdatedBy: userName
  };

  await updateDoc(ref, updatePayload);

  const message = buildLogMessage({
    pressId,
    slotIndex,
    setup,
    previousSetup
  });

  await addLogToFirestore({
    user: userName,
    message
  });

  console.log(`✅ Updated ${pressId} slot ${slotIndex}`);
}
