import { watchPressesFromFirestore } from './firestore-presses.js';
import { formatTime, statusLabel, normalizedSlotStatus } from './utils.js';

const areaFilter = document.getElementById('displayAreaFilter');
const autoScrollSelect = document.getElementById('displayAutoScroll');
const lastSync = document.getElementById('displayLastSync');
const scrollArea = document.getElementById('displayScrollArea');
const boardContent = document.getElementById('displayBoardContent');

let presses = [];
let unsubscribePresses = null;
let scrollTimer = null;
let scrollDirection = 1;
let scrollHoldUntil = 0;

initDisplayBoard();

function initDisplayBoard() {
  const savedArea = localStorage.getItem('displayBoardArea') || 'all';
  const savedAuto = localStorage.getItem('displayBoardAutoScroll') || 'on';

  if (autoScrollSelect) autoScrollSelect.value = savedAuto;

  areaFilter?.addEventListener('change', () => {
    localStorage.setItem('displayBoardArea', areaFilter.value);
    renderDisplayBoard();
    restartAutoScroll(true);
  });

  autoScrollSelect?.addEventListener('change', () => {
    localStorage.setItem('displayBoardAutoScroll', autoScrollSelect.value);
    restartAutoScroll(true);
  });

  unsubscribePresses = watchPressesFromFirestore((livePresses) => {
    presses = livePresses.map((press) => ({
      ...press,
      isLocked: Boolean(press.isLocked)
    }));

    syncAreaOptions(savedArea);
    renderDisplayBoard();
    updateSyncTime();
    restartAutoScroll(false);
  });
}

function updateSyncTime() {
  if (!lastSync) return;

  lastSync.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSlotsArray(press) {
  const raw = Array.isArray(press.slots) ? press.slots : Object.values(press.slots || {});
  const slots = raw.slice(0, 4).map((slot) => slot || emptySlot());

  while (slots.length < 4) slots.push(emptySlot());
  return slots;
}

function emptySlot() {
  return {
    partNumber: '',
    qtyRemaining: 0,
    status: 'next',
    notes: '',
    updatedAt: '',
    lastUpdatedBy: ''
  };
}

function equipmentLabel(press) {
  return press.equipmentName || `Press ${press.pressNumber}`;
}

function areaLabel(press) {
  return press.areaName || press.area || 'Unassigned';
}

function areaKey(press) {
  return press.areaId || `area-${areaLabel(press).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function syncAreaOptions(preferredValue = '') {
  if (!areaFilter) return;

  const currentValue = localStorage.getItem('displayBoardArea') || preferredValue || areaFilter.value || 'all';
  const areas = new Map();

  presses.forEach((press) => {
    areas.set(areaKey(press), {
      key: areaKey(press),
      label: areaLabel(press),
      color: press.areaColor || '#2563eb'
    });
  });

  const sortedAreas = [...areas.values()].sort((a, b) => a.label.localeCompare(b.label));

  areaFilter.innerHTML = `
    <option value="all">All Areas</option>
    ${sortedAreas.map((area) => `<option value="${area.key}">${area.label}</option>`).join('')}
  `;

  const hasValue = currentValue === 'all' || sortedAreas.some((area) => area.key === currentValue);
  areaFilter.value = hasValue ? currentValue : 'all';
}

function filteredPresses() {
  const selectedArea = areaFilter?.value || 'all';

  return presses
    .filter((press) => {
      const slots = getSlotsArray(press);
      const hasActiveSetup = slots.some((slot) => slot.partNumber);

      if (!hasActiveSetup) return false;
      if (selectedArea === 'all') return true;

      return areaKey(press) === selectedArea;
    })
    .sort(sortDisplayPresses);
}

function sortDisplayPresses(a, b) {
  const aPriority = displayPriority(a);
  const bPriority = displayPriority(b);

  if (aPriority !== bPriority) return aPriority - bPriority;

  const areaCompare = areaLabel(a).localeCompare(areaLabel(b), undefined, { numeric: true });
  if (areaCompare !== 0) return areaCompare;

  return equipmentLabel(a).localeCompare(equipmentLabel(b), undefined, { numeric: true });
}

function displayPriority(press) {
  const slots = getSlotsArray(press);

  const slot1Ready =
    slots[0]?.partNumber &&
    normalizedSlotStatus(slots[0].status, 0, true) === 'ready';

  if (slot1Ready) return 0;

  const hasReady = slots.some((slot, index) =>
    slot.partNumber && normalizedSlotStatus(slot.status, index, true) === 'ready'
  );

  const hasBlocked = slots.some((slot) =>
    slot.partNumber && slot.status === 'blocked'
  );

  if (hasReady) return 1;
  if (hasBlocked) return 2;
  return 3;
}

function renderDisplayBoard() {
  const visiblePresses = filteredPresses();

  if (!boardContent) return;

  if (!visiblePresses.length) {
    boardContent.innerHTML = `<div class="display-empty-state">No equipment found.</div>`;
    return;
  }

  const sortedPresses = [...visiblePresses].sort(sortDisplayPresses);

  boardContent.innerHTML = `
    <div class="display-flat-list">
      ${sortedPresses.map((press) => renderEquipmentRow(press)).join('')}
    </div>
  `;
}

function renderEquipmentRow(press) {
  const slots = getSlotsArray(press);
  const activeSlots = slots.filter((slot) => slot.partNumber).length;
  const status = equipmentStatus(press, slots);

  return `
    <article class="display-equipment-row ${status.className}" style="--area-color:${press.areaColor || '#2563eb'};">
      <div class="display-equipment-summary">
        <div class="display-equipment-title">
          <strong>${equipmentLabel(press)}</strong>
          <span>${areaLabel(press)}${press.isLocked ? ' · Locked' : ''}</span>
        </div>
        <span class="status-pill ${status.className}">${status.label}</span>
        <span class="display-active-count">${activeSlots} / ${slots.length} setups</span>
      </div>

      <div class="display-slot-strip compact-tv">
        ${renderDisplaySlot(slots[0], 0)}
        ${renderDisplaySlot(getNextSlot(slots), 1, 'Next')}
      </div>
    </article>
  `;
}

function equipmentStatus(press, slots) {
  if (press.isLocked) return { label: 'Locked', className: 'blocked' };
  if (slots.some((slot) => slot.status === 'blocked')) return { label: 'On Hold', className: 'blocked' };
  if (slots.some((slot, index) => normalizedSlotStatus(slot.status, index, Boolean(slot.partNumber)) === 'ready')) {
    return { label: 'READY FOR CHANGEOVER', className: 'ready' };
  }
  if (slots.some((slot) => slot.partNumber)) return { label: 'Current / Next', className: 'current' };
  return { label: 'No Setups', className: 'no_setup' };
}

function getNextSlot(slots) {
  return slots.slice(1).find((slot) => slot.partNumber) || emptySlot();
}

function renderDisplaySlot(slot, index, labelOverride = null) {
  const empty = !slot.partNumber;
  const statusClass = empty ? 'no_setup' : normalizedSlotStatus(slot.status, index, true);
  const isReady = statusClass === 'ready';
  const label = labelOverride || (index === 0 ? 'Current' : `Slot ${index + 1}`);

  return `
    <div class="display-slot-card ${empty ? 'empty' : ''} ${isReady ? 'ready-slot' : ''}">
      ${isReady ? `<div class="display-ready-banner">READY FOR CHANGEOVER</div>` : ''}
      <div class="display-slot-topline">
        <strong>${label}</strong>
        <span class="status-pill ${statusClass}">${empty ? 'No Setup' : statusLabel(statusClass)}</span>
      </div>
      <div class="display-slot-main">
        <span>Part</span>
        <strong>${slot.partNumber || '—'}</strong>
      </div>
      <div class="display-slot-bottom">
        <span>Qty ${slot.partNumber ? slot.qtyRemaining || 0 : '—'}</span>
        <span>${slot.updatedAt ? formatTime(slot.updatedAt) : '—'}</span>
      </div>
    </div>
  `;
}

function restartAutoScroll(resetPosition) {
  stopAutoScroll();

  if (resetPosition && scrollArea) {
    scrollArea.scrollTop = 0;
    scrollDirection = 1;
  }

  if (autoScrollSelect?.value !== 'on') return;
  if (!scrollArea) return;

  window.setTimeout(() => {
    if (scrollArea.scrollHeight <= scrollArea.clientHeight + 20) return;

    scrollHoldUntil = Date.now() + 1800;

    scrollTimer = window.setInterval(() => {
      if (!scrollArea) return;
      if (Date.now() < scrollHoldUntil) return;

      const bottom = scrollArea.scrollHeight - scrollArea.clientHeight;

      if (scrollArea.scrollTop >= bottom - 2) {
        scrollDirection = -1;
        scrollHoldUntil = Date.now() + 2400;
      } else if (scrollArea.scrollTop <= 2) {
        scrollDirection = 1;
        scrollHoldUntil = Date.now() + 1800;
      }

      scrollArea.scrollTop += scrollDirection;
    }, 45);
  }, 250);
}

function stopAutoScroll() {
  if (scrollTimer) {
    window.clearInterval(scrollTimer);
    scrollTimer = null;
  }
}

window.addEventListener('beforeunload', () => {
  stopAutoScroll();
  if (typeof unsubscribePresses === 'function') unsubscribePresses();
});