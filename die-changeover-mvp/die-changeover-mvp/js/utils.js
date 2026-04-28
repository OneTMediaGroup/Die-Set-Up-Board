export function formatTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function normalizedSlotStatus(status, slotIndex = 0, hasPart = true) {
  if (!hasPart) return 'no_setup';

  const legacyMap = {
    ready_for_changeover: 'ready',
    change_complete: 'current',
    change_in_progress: 'ready',
    running: 'current',
    not_running: slotIndex === 0 ? 'current' : 'next'
  };

  return legacyMap[status] || status || (slotIndex === 0 ? 'current' : 'next');
}

export function statusLabel(status) {
  const labels = {
    current: 'Current',
    next: 'Next',
    ready: 'Ready for Changeover',
    ready_for_changeover: 'Ready for Changeover',
    not_running: 'Next',
    running: 'Current',
    change_in_progress: 'Ready for Changeover',
    change_complete: 'Current',
    blocked: 'Blocked / Maintenance',
    no_setup: 'No Setup'
  };

  return labels[status] || status || '--';
}
