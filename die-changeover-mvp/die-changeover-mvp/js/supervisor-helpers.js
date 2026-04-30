import { formatTime, statusLabel, normalizedSlotStatus } from './utils.js';

export function equipmentLabel(press) {
  return press.equipmentName || `Press ${press.pressNumber}`;
}

function makeEmptySlot(slotIndex = 0) {
  return {
    partNumber: '',
    qtyRemaining: 0,
    status: slotIndex === 0 ? 'current' : 'next',
    notes: '',
    updatedAt: '',
    lastUpdatedBy: ''
  };
}

export function getSlotsArray(press) {
  const rawSlots = Array.isArray(press.slots)
    ? press.slots
    : Object.values(press.slots || {});

  const normalized = rawSlots.slice(0, 4).map((slot, index) => {
    if (!slot) return makeEmptySlot(index);

    const hasPart = Boolean(slot.partNumber);
    return {
      ...slot,
      partNumber: slot.partNumber || '',
      qtyRemaining: Number(slot.qtyRemaining || 0),
      status: hasPart ? normalizedSlotStatus(slot.status, index, true) : (index === 0 ? 'current' : 'next'),
      notes: slot.notes || '',
      updatedAt: slot.updatedAt || '',
      lastUpdatedBy: slot.lastUpdatedBy || ''
    };
  });

  while (normalized.length < 4) {
    normalized.push(makeEmptySlot(normalized.length));
  }

  return normalized;
}

export function activeSetupCount(presses) {
  return presses.flatMap((press) => getSlotsArray(press)).filter((slot) => slot.partNumber).length;
}

export function areaLabel(press) {
  return press.areaName || press.area || 'Unassigned';
}

export function equipmentStatus(press) {
  const slots = getSlotsArray(press);
  const active = slots.filter((slot) => slot.partNumber).length;
  const ready = slots.filter((slot) => normalizedSlotStatus(slot.status, 0, Boolean(slot.partNumber)) === 'ready').length;
  const blocked = slots.filter((slot) => slot.status === 'blocked').length;

  if (press.isLocked) return { label: 'Locked', className: 'blocked', active, ready, blocked };
  if (blocked > 0) return { label: 'On Hold', className: 'blocked', active, ready, blocked };
  if (ready > 0) return { label: 'Ready', className: 'ready', active, ready, blocked };
  if (active > 0) return { label: 'Current / Next', className: 'current', active, ready, blocked };
  return { label: 'No Setups', className: 'no_setup', active, ready, blocked };
}

function slotDisplayStatus(slot, slotIndex) {
  if (!slot.partNumber) return 'no_setup';
  return normalizedSlotStatus(slot.status, slotIndex, true);
}

export function renderSlotCard(press, slot, slotIndex, selected = false, options = {}) {
  const editable = Boolean(options.editable);
  const empty = !slot.partNumber;
  const displayStatus = slotDisplayStatus(slot, slotIndex);
  const selectedStyle = selected
    ? 'border:2px solid rgba(37,99,235,0.45); box-shadow:0 0 0 3px rgba(37,99,235,0.10); cursor:pointer;'
    : 'cursor:pointer;';

  if (editable) {
    return `
      <section
        class="slot-card supervisor-slot-pick supervisor-slot-edit${selected ? ' selected-slot-card' : ''}${empty ? ' empty-slot-card' : ''}"
        data-pick-press="${press.id}"
        data-pick-slot="${slotIndex}"
        style="${selectedStyle}"
      >
        <div class="slot-header">
          <h4>Slot ${slotIndex + 1}</h4>
          <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(displayStatus)}</span>
        </div>

        <div class="inline-slot-form" data-inline-press="${press.id}" data-inline-slot="${slotIndex}">
          <label>
            <span>Part</span>
            <input data-slot-part value="${slot.partNumber || ''}" placeholder="Part number" />
          </label>
          <label>
            <span>Qty</span>
            <input data-slot-qty type="number" min="0" value="${slot.partNumber ? slot.qtyRemaining || 0 : ''}" placeholder="Qty" />
          </label>
          <label class="inline-notes">
            <span>Notes</span>
            <textarea data-slot-notes rows="2" placeholder="Notes">${slot.notes || ''}</textarea>
          </label>
          <div class="inline-slot-actions">
            <button type="button" class="button primary" data-save-slot="${press.id}" data-slot-index="${slotIndex}">Save</button>
            
            ${!empty ? `<button type="button" class="button" data-clear-slot="${press.id}" data-slot-index="${slotIndex}">Clear</button>` : ''}
          </div>
        </div>

        <div class="muted">Updated ${slot.updatedAt ? formatTime(slot.updatedAt) : '—'}</div>
      </section>
    `;
  }

  return `
    <section
      class="slot-card supervisor-slot-pick${selected ? ' selected-slot-card' : ''}${empty ? ' empty-slot-card' : ''}"
      data-pick-press="${press.id}"
      data-pick-slot="${slotIndex}"
      style="${selectedStyle}"
    >
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(displayStatus)}</span>
      </div>
      <div class="slot-meta">
        <div class="meta-box"><span>Part</span><strong>${slot.partNumber || '—'}</strong></div>
        <div class="meta-box"><span>Qty</span><strong>${slot.partNumber ? slot.qtyRemaining : '—'}</strong></div>
      </div>
      <div class="slot-note">${slot.notes || 'No notes added.'}</div>
      <div class="muted">Last updated by ${slot.lastUpdatedBy || press.lastUpdatedBy || '—'}</div>
      <div class="muted">Updated ${slot.updatedAt ? formatTime(slot.updatedAt) : '—'}</div>
    </section>
  `;
}

function normalizeQueueOptions(arg1, arg2, arg3) {
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    return {
      selectedPressId: arg1.selectedPressId || '',
      selectedSlotIndex: arg1.selectedSlotIndex || '',
      expanded: Boolean(arg1.expanded),
      showAddSetup: Boolean(arg1.showAddSetup),
      showMenu: Boolean(arg1.showMenu),
      editable: Boolean(arg1.editable)
    };
  }

  return {
    selectedPressId: arg1 || '',
    selectedSlotIndex: arg2 || '',
    expanded: Boolean(arg3),
    showAddSetup: false,
    showMenu: false,
    editable: false
  };
}

export function renderPressQueueRow(press, arg1 = '', arg2 = '', arg3 = false) {
  const options = normalizeQueueOptions(arg1, arg2, arg3);
  const slots = getSlotsArray(press);
  const status = equipmentStatus(press);
  const selectedOnPress = press.id === options.selectedPressId;
  const chevron = options.expanded ? '⌄' : '›';

  return `
    <article class="supervisor-equipment-row${options.expanded ? ' expanded' : ''}${selectedOnPress ? ' selected-equipment-row' : ''}">
      <button class="supervisor-equipment-summary-row" type="button" data-toggle-press="${press.id}">
        <span class="queue-chevron">${chevron}</span>
        <span class="queue-equipment-name">${equipmentLabel(press)}</span>
        <span class="queue-slot-count">${slots.length}</span>
        <span class="queue-equipment-meta">${areaLabel(press)} {press.shift || '1'}${press.isLocked ? ' · Locked' : ''}</span>
        <span class="status-pill queue-status ${status.className}">${status.label}</span>
        <span class="queue-active-count">${status.active} active setup${status.active === 1 ? '' : 's'}</span>
        ${options.showAddSetup ? `<span class="button queue-add-button" data-queue-add="${press.id}">+ Add Setup</span>` : ''}
        ${options.showMenu ? `<span class="queue-menu">⋮</span>` : ''}
      </button>

      ${options.expanded ? `
        <div class="queue-expanded-slots">
          ${slots.map((slot, originalIndex) => {
            const selected = press.id === options.selectedPressId && String(originalIndex) === String(options.selectedSlotIndex);
            return renderSlotCard(press, slot, originalIndex, selected, { editable: options.editable });
          }).join('')}
        </div>
      ` : ''}
    </article>
  `;
}
