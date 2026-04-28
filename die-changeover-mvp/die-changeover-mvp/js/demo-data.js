export const demoUsers = [
  { id: 'u1', name: 'Bab S.', role: 'dieSetter' },
  { id: 'u2', name: 'Sully T.', role: 'supervisor' },
  { id: 'u3', name: 'Jam A.', role: 'maintenance' },
  { id: 'u4', name: 'IT Admin', role: 'admin' }
];

export const demoStatuses = [
  { id: 'current', label: 'Current', color: 'blue' },
  { id: 'next', label: 'Next', color: 'grey' },
  { id: 'ready', label: 'Ready for Changeover', color: 'green' },
  { id: 'blocked', label: 'Blocked', color: 'red' }
];

export const demoPresses = [
  { id: 'p20', pressNumber: 20, area: 'Arcur 1', shift: '1', slots: [
    { partNumber: '600M02', qtyRemaining: 111, status: 'next', notes: '', updatedAt: nowMinus(40) },
    { partNumber: 'T477005A', qtyRemaining: 123, status: 'current', notes: 'Tooling ready', updatedAt: nowMinus(22) },
    { partNumber: '681SP3', qtyRemaining: 1447, status: 'ready', notes: 'Waiting on forklift', updatedAt: nowMinus(8) },
    { partNumber: '300W02', qtyRemaining: 1, status: 'current', notes: 'Ready to clear', updatedAt: nowMinus(4) }
  ]},
  { id: 'p22', pressNumber: 22, area: 'Arcur 1', shift: '1', slots: [
    { partNumber: '600W02', qtyRemaining: 556, status: 'ready', notes: '', updatedAt: nowMinus(30) },
    { partNumber: '681SP3', qtyRemaining: 888, status: 'current', notes: '', updatedAt: nowMinus(20) },
    { partNumber: '', qtyRemaining: 0, status: 'next', notes: '', updatedAt: nowMinus(55) },
    { partNumber: '', qtyRemaining: 0, status: 'next', notes: '', updatedAt: nowMinus(55) }
  ]},
  { id: 'p34', pressNumber: 34, area: 'Arcur 2', shift: '2', slots: [
    { partNumber: '600M02', qtyRemaining: 547, status: 'current', notes: 'Runner verified', updatedAt: nowMinus(13) },
    { partNumber: '', qtyRemaining: 0, status: 'next', notes: '', updatedAt: nowMinus(35) },
    { partNumber: '', qtyRemaining: 0, status: 'next', notes: '', updatedAt: nowMinus(35) },
    { partNumber: '', qtyRemaining: 0, status: 'next', notes: '', updatedAt: nowMinus(35) }
  ]},
  { id: 'p59', pressNumber: 59, area: 'Arcur 2', shift: '3', slots: [
    { partNumber: 'T725005', qtyRemaining: 658, status: 'current', notes: 'Changeover cleared', updatedAt: nowMinus(12) },
    { partNumber: 'T728005', qtyRemaining: 147, status: 'current', notes: '', updatedAt: nowMinus(10) },
    { partNumber: 'T681005', qtyRemaining: 77743, status: 'current', notes: '', updatedAt: nowMinus(6) },
    { partNumber: 'T725005', qtyRemaining: 4447, status: 'next', notes: 'Queued next', updatedAt: nowMinus(2) }
  ]}
];

export const demoAuditLog = [
  log('Sully T.', 'Created setup on Press 20 Slot 2'),
  log('Bab S.', 'Marked Press 59 Slot 1 complete'),
  log('Jam A.', 'Acknowledged maintenance flag on Press 20 Slot 3'),
  log('IT Admin', 'Seeded demo data')
];

function nowMinus(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function log(user, message) {
  return {
    id: crypto.randomUUID(),
    user,
    message,
    createdAt: new Date().toISOString()
  };
}
