import { formatTime, statusLabel } from './utils.js';

export function equipmentLabel(press) {
  return press.equipmentName || `Press ${press.pressNumber}`;
}

export function getSlotsArray(press) {
  if (Array.isArray(press.slots)) return press.slots;
  return Object.values(press.slots || {});
}

export function activeSetupCount(presses) {
  return presses.flatMap((press) => getSlotsArray(press)).filter((slot) => slot.partNumber).length;
}

export function areaLabel(press) {
  return press.areaName || press.area || 'Unassigned';
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

export function renderPressQueueRow(press, selectedPressId = '', selectedSlotIndex = '') {
  const slots = getSlotsArray(press);
  const sortedSlots = [...slots].sort((a, b) => {
    const aReady = a.status === 'ready_for_changeover';
    const bReady = b.status === 'ready_for_changeover';
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return 0;
  });

  return `
    <article class="press-row">
      <div class="press-row-header">
        <div>
          <h3>${equipmentLabel(press)}</h3>
          <div class="muted">${areaLabel(press)} · Shift ${press.shift || '1'}${press.isLocked ? ' · Locked' : ''}</div>
        </div>
        <div class="muted">${slots.filter((slot) => slot.partNumber).length} active setups</div>
      </div>
      <div class="slot-grid">
        ${sortedSlots.map((slot) => {
          const originalIndex = slots.indexOf(slot);
          const selected = press.id === selectedPressId && String(originalIndex) === String(selectedSlotIndex);
          return renderSlotCard(press, slot, originalIndex, selected);
        }).join('')}
      </div>
    </article>
  `;
}
