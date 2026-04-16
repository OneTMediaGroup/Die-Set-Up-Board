export function formatTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function statusLabel(status) {
  return status.replaceAll('_', ' ');
}
