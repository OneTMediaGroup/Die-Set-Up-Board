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


function makeEmptySlot(now, userName) {
  return {
    partNumber: '',
    qtyRemaining: 0,
    status: 'not_running',
    notes: '',
    updatedAt: now,
    lastUpdatedBy: userName
  };
}

function normalizeSlots(rawSlots, now, userName) {
  const slots = Array.isArray(rawSlots) ? [...rawSlots] : Object.values(rawSlots || {});

  while (slots.length < 4) {
    slots.push(makeEmptySlot(now, userName));
  }

  return slots.slice(0, 4);
}

export async function completeAndShiftSetupInFirestore({ pressId, slotIndex, setup, userName }) {
  const ref = doc(db, 'presses', pressId);
  const now = new Date().toISOString();
  const expectedUpdatedAt = setup.expectedUpdatedAt || null;

  let completedSlot = null;
  let equipmentLabel = pressId.toUpperCase();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error(`Press ${pressId} not found`);
    }

    const pressData = snap.data();
    equipmentLabel = pressData.equipmentName || `Press ${pressData.pressNumber || pressId}`;

    const slots = normalizeSlots(pressData.slots || [], now, userName);
    const currentSlot = slots[slotIndex] || {};

    if (!currentSlot.partNumber) {
      throw new Error('Selected slot has no active setup.');
    }

    const currentUpdatedAt = currentSlot.updatedAt || null;
    const currentLastUpdatedBy = currentSlot.lastUpdatedBy || pressData.lastUpdatedBy || null;

    if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
      throw makeConflictError({
        pressId,
        slotIndex,
        lastUpdatedBy: currentLastUpdatedBy,
        updatedAt: currentUpdatedAt
      });
    }

    completedSlot = {
      ...currentSlot,
      status: 'change_complete',
      notes: setup.notes ?? currentSlot.notes ?? '',
      updatedAt: now,
      lastUpdatedBy: userName
    };

    const nextSlots = [
      ...slots.slice(0, slotIndex),
      ...slots.slice(slotIndex + 1),
      makeEmptySlot(now, userName)
    ].slice(0, 4);

    transaction.update(ref, {
      slots: nextSlots,
      updatedAt: now,
      lastUpdatedBy: userName
    });
  });

  await addLogToFirestore({
    user: userName,
    message: `Completed ${equipmentLabel} Slot ${slotIndex + 1} · ${completedSlot?.partNumber || '—'} · shifted queue forward`
  });

  console.log(`✅ Completed and shifted ${pressId} slot ${slotIndex}`);

  return { ok: true, shifted: true };
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
