import { formatTime, statusLabel } from './utils.js';

export function equipmentLabel(press) {
  return press.equipmentName || `Press ${press.pressNumber}`;
}

function makeEmptySlot() {
  return {
    partNumber: '',
    qtyRemaining: 0,
    status: 'not_running',
    notes: '',
    updatedAt: '',
    lastUpdatedBy: ''
  };
}

export function getSlotsArray(press) {
  const rawSlots = Array.isArray(press.slots)
    ? press.slots
    : Object.values(press.slots || {});

  const normalized = rawSlots.slice(0, 4).map((slot) => slot || makeEmptySlot());

  while (normalized.length < 4) {
    normalized.push(makeEmptySlot());
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
  const ready = slots.filter((slot) => slot.status === 'ready_for_changeover').length;
  const blocked = slots.filter((slot) => slot.status === 'blocked').length;
  const progress = slots.filter((slot) => slot.status === 'change_in_progress').length;
  const complete = slots.filter((slot) => slot.status === 'change_complete').length;

  if (press.isLocked) return { label: 'Locked', className: 'blocked', active, ready, blocked, progress, complete };
  if (blocked > 0) return { label: 'On Hold', className: 'blocked', active, ready, blocked, progress, complete };
  if (progress > 0) return { label: 'In Progress', className: 'change_in_progress', active, ready, blocked, progress, complete };
  if (ready > 0) return { label: 'Ready', className: 'change_complete', active, ready, blocked, progress, complete };
  if (active > 0) return { label: 'Planned', className: 'not_running', active, ready, blocked, progress, complete };
  return { label: 'No Setups', className: 'no_setup', active, ready, blocked, progress, complete };
}

export function renderSlotCard(press, slot, slotIndex, selected = false) {
  const empty = !slot.partNumber;
  const displayStatus = empty ? 'no_setup' : slot.status;
  const selectedStyle = selected
    ? 'border:2px solid rgba(37,99,235,0.45); box-shadow:0 0 0 3px rgba(37,99,235,0.10); cursor:pointer;'
    : 'cursor:pointer;';

  return `
    <section
      class="slot-card supervisor-slot-pick${selected ? ' selected-slot-card' : ''}${empty ? ' empty-slot-card' : ''}"
      data-pick-press="${press.id}"
      data-pick-slot="${slotIndex}"
      style="${selectedStyle}"
    >
      <div class="slot-header">
        <h4>Slot ${slotIndex + 1}</h4>
        <span class="status-pill ${displayStatus}">${empty ? 'No Setup' : statusLabel(slot.status)}</span>
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
      showMenu: Boolean(arg1.showMenu)
    };
  }

  return {
    selectedPressId: arg1 || '',
    selectedSlotIndex: arg2 || '',
    expanded: Boolean(arg3),
    showAddSetup: false,
    showMenu: false
  };
}

export function renderPressQueueRow(press, arg1 = '', arg2 = '', arg3 = false) {
  const options = normalizeQueueOptions(arg1, arg2, arg3);
  const slots = getSlotsArray(press);
  const status = equipmentStatus(press);
  const selectedOnPress = press.id === options.selectedPressId;
  const chevron = options.expanded ? '⌄' : '›';

  const sortedSlots = [...slots].sort((a, b) => {
    const aReady = a.status === 'ready_for_changeover';
    const bReady = b.status === 'ready_for_changeover';
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return 0;
  });

  return `
    <article class="supervisor-equipment-row${options.expanded ? ' expanded' : ''}${selectedOnPress ? ' selected-equipment-row' : ''}">
      <button class="supervisor-equipment-summary-row" type="button" data-toggle-press="${press.id}">
        <span class="queue-chevron">${chevron}</span>
        <span class="queue-equipment-name">${equipmentLabel(press)}</span>
        <span class="queue-slot-count">${slots.length}</span>
        <span class="queue-equipment-meta">${areaLabel(press)} · Shift ${press.shift || '1'}${press.isLocked ? ' · Locked' : ''}</span>
        <span class="status-pill queue-status ${status.className}">${status.label}</span>
        <span class="queue-active-count">${status.active} active setup${status.active === 1 ? '' : 's'}</span>
        ${options.showAddSetup ? `<span class="button queue-add-button" data-queue-add="${press.id}">+ Add Setup</span>` : ''}
        ${options.showMenu ? `<span class="queue-menu">⋮</span>` : ''}
      </button>

      ${options.expanded ? `
        <div class="queue-expanded-slots">
          ${sortedSlots.map((slot) => {
            const originalIndex = slots.indexOf(slot);
            const selected = press.id === options.selectedPressId && String(originalIndex) === String(options.selectedSlotIndex);
            return renderSlotCard(press, slot, originalIndex, selected);
          }).join('')}
        </div>
      ` : ''}
    </article>
  `;
}
