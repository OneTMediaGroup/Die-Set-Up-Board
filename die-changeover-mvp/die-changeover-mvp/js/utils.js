export function formatTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function statusLabel(status) {
  const labels = {
    not_running: 'Not Running',
    running: 'Running',
    change_in_progress: 'In Progress',
    change_complete: 'Complete',
    blocked: 'Blocked / Maintenance',
    no_setup: 'No Setup'
  };

  return labels[status] || status;
}
