import { db } from './firebase-config.js';
import {
  doc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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

function makeConflictError({ pressId, slotIndex, lastUpdatedBy, updatedAt }) {
  const error = new Error('conflict');
  error.code = 'slot-conflict';
  error.pressId = pressId;
  error.slotIndex = slotIndex;
  error.lastUpdatedBy = lastUpdatedBy || 'another user';
  error.updatedAt = updatedAt || null;
  return error;
}

export async function updateSetupInFirestore({ pressId, slotIndex, setup, userName }) {
  const ref = doc(db, 'presses', pressId);
  const now = new Date().toISOString();
  const previousSetup = setup.previousSetup || null;
  const expectedUpdatedAt = setup.expectedUpdatedAt || null;

  let conflictMeta = null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error(`Press ${pressId} not found`);
    }

    const pressData = snap.data();
    const rawSlots = pressData.slots || [];
    const slots = Array.isArray(rawSlots) ? [...rawSlots] : Object.values(rawSlots);
    const currentSlot = slots[slotIndex] || {};

    const currentUpdatedAt = currentSlot.updatedAt || null;
    const currentLastUpdatedBy = currentSlot.lastUpdatedBy || pressData.lastUpdatedBy || null;

    if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
      conflictMeta = {
        lastUpdatedBy: currentLastUpdatedBy,
        updatedAt: currentUpdatedAt
      };
      throw makeConflictError({
        pressId,
        slotIndex,
        lastUpdatedBy: currentLastUpdatedBy,
        updatedAt: currentUpdatedAt
      });
    }

    const nextSlot = {
      ...currentSlot,
      partNumber: setup.partNumber,
      qtyRemaining: setup.qtyRemaining,
      status: setup.status,
      notes: setup.notes,
      updatedAt: now,
      lastUpdatedBy: userName
    };

    slots[slotIndex] = nextSlot;

    transaction.update(ref, {
      slots,
      updatedAt: now,
      lastUpdatedBy: userName
    });
  });

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

  return {
    ok: true,
    conflict: false,
    conflictMeta
  };
}
