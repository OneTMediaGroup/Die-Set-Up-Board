import { db } from './firebase-config.js';
import {
  doc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addLogToFirestore } from './firestore-logs.js';
import { normalizedSlotStatus, statusLabel } from './utils.js';

function makeConflictError({ pressId, slotIndex, lastUpdatedBy, updatedAt }) {
  const error = new Error('conflict');
  error.code = 'slot-conflict';
  error.pressId = pressId;
  error.slotIndex = slotIndex;
  error.lastUpdatedBy = lastUpdatedBy || 'another user';
  error.updatedAt = updatedAt || null;
  return error;
}

function emptySlot(now, userName) {
  return {
    partNumber: '',
    qtyRemaining: 0,
    status: 'next',
    notes: '',
    updatedAt: now,
    lastUpdatedBy: userName || ''
  };
}

function normalizeSlots(rawSlots, now, userName) {
  const raw = Array.isArray(rawSlots) ? [...rawSlots] : Object.values(rawSlots || {});
  const slots = raw.slice(0, 4).map((slot, index) => {
    const hasPart = Boolean(slot?.partNumber);
    return {
      partNumber: slot?.partNumber || '',
      qtyRemaining: Number(slot?.qtyRemaining || 0),
      status: hasPart ? normalizedSlotStatus(slot?.status, index, true) : 'next',
      notes: slot?.notes || '',
      updatedAt: slot?.updatedAt || now,
      lastUpdatedBy: slot?.lastUpdatedBy || userName || ''
    };
  });

  while (slots.length < 4) {
    slots.push(emptySlot(now, userName));
  }

  return normalizeQueueOrder(slots, now, userName);
}

function normalizeQueueOrder(slots, now, userName) {
  const normalized = slots.slice(0, 4).map((slot, index) => {
    const hasPart = Boolean(slot?.partNumber);
    if (!hasPart) {
      return emptySlot(slot?.updatedAt || now, slot?.lastUpdatedBy || userName || '');
    }

    return {
      ...slot,
      status: normalizedSlotStatus(slot.status, index, true)
    };
  });

  const firstActiveIndex = normalized.findIndex((slot) => slot.partNumber);

  normalized.forEach((slot, index) => {
    if (!slot.partNumber) {
      slot.status = 'next';
      return;
    }

    if (index === firstActiveIndex) {
      slot.status = slot.status === 'ready' ? 'ready' : 'current';
    } else if (slot.status !== 'blocked') {
      slot.status = 'next';
    }
  });

  while (normalized.length < 4) normalized.push(emptySlot(now, userName));
  return normalized.slice(0, 4);
}

function buildLogMessage({ pressId, slotIndex, setup, previousSetup }) {
  const pressCode = pressId.toUpperCase();
  const slotText = `Slot ${slotIndex + 1}`;
  const hasPart = Boolean(setup.partNumber);
  const previousStatus = normalizedSlotStatus(previousSetup?.status, slotIndex, Boolean(previousSetup?.partNumber));
  const newStatus = normalizedSlotStatus(setup.status, slotIndex, hasPart);

  if (!hasPart) return `Cleared ${pressCode} ${slotText}`;
  if (!previousSetup?.partNumber) return `Loaded ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining}`;

  if (previousStatus !== newStatus) {
    if (newStatus === 'blocked') return `Blocked ${pressCode} ${slotText} · ${setup.partNumber} · ${setup.notes || 'No reason added'}`;
    if (newStatus === 'ready') return `Ready for next step ${pressCode} ${slotText} · ${setup.partNumber}`;
    return `Updated status ${pressCode} ${slotText} · ${setup.partNumber} · ${statusLabel(newStatus)}`;
  }

  const qtyChanged = Number(previousSetup?.qtyRemaining || 0) !== Number(setup.qtyRemaining || 0);
  const notesChanged = (previousSetup?.notes || '') !== (setup.notes || '');
  const partChanged = (previousSetup?.partNumber || '') !== (setup.partNumber || '');

  if (partChanged) return `Changed setup ${pressCode} ${slotText} · ${previousSetup?.partNumber || '—'} → ${setup.partNumber}`;
  if (qtyChanged && notesChanged) return `Updated ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining} + notes`;
  if (qtyChanged) return `Updated qty ${pressCode} ${slotText} · ${setup.partNumber} · Qty ${setup.qtyRemaining}`;
  if (notesChanged) return `Updated notes ${pressCode} ${slotText} · ${setup.partNumber}`;

  return `Updated ${pressCode} ${slotText} · ${setup.partNumber}`;
}

export async function completeAndShiftSetupInFirestore({ pressId, slotIndex = 0, setup = {}, userName }) {
  const ref = doc(db, 'presses', pressId);
  const now = new Date().toISOString();
  const expectedUpdatedAt = setup.expectedUpdatedAt || null;

  let completedSlot = null;
  let equipmentLabel = pressId.toUpperCase();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error(`Press ${pressId} not found`);

    const pressData = snap.data();
    equipmentLabel = pressData.equipmentName || `Press ${pressData.pressNumber || pressId}`;

    const slots = normalizeSlots(pressData.slots || [], now, userName);
    const currentSlot = slots[slotIndex] || {};

    if (!currentSlot.partNumber) throw new Error('Selected slot has no active setup.');

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

    completedSlot = { ...currentSlot };

    const shifted = [
      ...slots.slice(0, slotIndex),
      ...slots.slice(slotIndex + 1),
      emptySlot(now, userName)
    ];

    const nextSlots = normalizeQueueOrder(shifted, now, userName);

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
    if (!snap.exists()) throw new Error(`Press ${pressId} not found`);

    const pressData = snap.data();
    const slots = normalizeSlots(pressData.slots || [], now, userName);
    const currentSlot = slots[slotIndex] || {};

    const currentUpdatedAt = currentSlot.updatedAt || null;
    const currentLastUpdatedBy = currentSlot.lastUpdatedBy || pressData.lastUpdatedBy || null;

    if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
      conflictMeta = { lastUpdatedBy: currentLastUpdatedBy, updatedAt: currentUpdatedAt };
      throw makeConflictError({
        pressId,
        slotIndex,
        lastUpdatedBy: currentLastUpdatedBy,
        updatedAt: currentUpdatedAt
      });
    }

    const partNumber = setup.partNumber || '';
    const hasPart = Boolean(partNumber);
    const status = hasPart
      ? normalizedSlotStatus(setup.status, slotIndex, true)
      : 'next';

    slots[slotIndex] = {
      ...currentSlot,
      partNumber,
      qtyRemaining: Number(setup.qtyRemaining || 0),
      status,
      notes: setup.notes || '',
      updatedAt: now,
      lastUpdatedBy: userName
    };

    const nextSlots = normalizeQueueOrder(slots, now, userName);

    transaction.update(ref, {
      slots: nextSlots,
      updatedAt: now,
      lastUpdatedBy: userName
    });
  });

  await addLogToFirestore({
    user: userName,
    message: buildLogMessage({ pressId, slotIndex, setup, previousSetup })
  });

  return { ok: true, conflict: false, conflictMeta };
}
