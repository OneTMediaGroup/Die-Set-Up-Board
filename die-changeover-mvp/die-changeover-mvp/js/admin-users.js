import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { fetchUsersFromFirestore, updateUserInFirestore } from './firestore-users.js';
import { getSession, setSession } from './store.js';
import { getStoredSessionUser, setStoredSessionUser } from './session-user.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;
let users = [];
let editingUserId = null;
let searchText = '';
let roleFilter = 'all';

const ROLES = [
  { value: 'operator', label: 'Operator' },
  { value: 'dieSetter', label: 'Auth Personal' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' }
];

const ROLE_ORDER = {
  operator: 0,
  dieSetter: 1,
  supervisor: 2,
  admin: 3
};

export async function mountUsersTool(container) {
  root = container;
  await loadAndRender();
  return () => {};
}

async function loadAndRender() {
  try {
    users = await fetchUsersFromFirestore();
    sortUsers();
    render();
  } catch (error) {
    console.error('❌ Failed to load users:', error);
    root.innerHTML = `<h2>Users</h2><div class="muted">Could not load users.</div>`;
  }
}

function sortUsers() {
  users = [...users].sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] ?? 99;
    const roleB = ROLE_ORDER[b.role] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
  });
}

function roleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label || role || 'No Role';
}

function statusFor(user) {
  return user.status || (user.isActive === false ? 'inactive' : 'active');
}

function filteredUsers() {
  return users.filter((user) => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const search = searchText.trim().toLowerCase();
    const matchesSearch = !search ||
      String(user.name || '').toLowerCase().includes(search) ||
      String(user.role || '').toLowerCase().includes(search) ||
      String(user.pin || '').toLowerCase().includes(search) ||
      String(user.employeeId || '').toLowerCase().includes(search) ||
      String(user.badgeCode || '').toLowerCase().includes(search) ||
      String(user.id || '').toLowerCase().includes(search);

    return matchesRole && matchesSearch;
  });
}

function roleCount(role) {
  return users.filter((user) => user.role === role).length;
}

function render() {
  const visibleUsers = filteredUsers();

  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>Users</h2>
        <p class="muted">Add users, set roles, manage PINs, and control access.</p>
      </div>
      <div class="topbar-right">
        <div class="header-stat"><span>Total</span><strong>${users.length}</strong></div>
        <div class="header-stat"><span>Active</span><strong>${users.filter((user) => statusFor(user) === 'active').length}</strong></div>
      </div>
    </div>

    <div class="admin-card user-add-panel">
      <div class="section-header">
        <div>
          <h2>Add User</h2>
          <div class="muted">Employee ID is used for manual entry. Badge Code is optional for scanner systems.</div>
        </div>
      </div>

      <div class="user-add-grid">
  <label>
    <span>Name</span>
    <input id="newUserName" placeholder="Example: Bab S." autocomplete="off" />
  </label>

  <label>
    <span>Role</span>
    <select id="newUserRole">
      ${ROLES.map((role) => `<option value="${role.value}" ${role.value === 'operator' ? 'selected' : ''}>${role.label}</option>`).join('')}
    </select>
  </label>

  

  <label>
    <span>Employee ID</span>
    <input id="newUserEmployeeId" inputmode="numeric" placeholder="Optional (e.g. 331)" />
  </label>

  <label>
    <span>Badge Code</span>
    <input id="newUserBadgeCode" placeholder="Optional scan code" />
  </label>

  <label>
    <span>Status</span>
    <select id="newUserStatus">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  </label>

  <button id="addUserBtn" class="button primary user-add-button">+ Add User</button>
</div>

    <div class="admin-card user-add-panel" style="margin-top:16px;">
      <div class="section-header">
        <div>
          <h2>Import Users</h2>
          <div class="muted">Upload CSV: name, role, employeeId, badgeCode, status.</div>
        </div>
      </div>

      <div class="user-add-grid">
        <label class="full-span">
          <span>CSV File</span>
          <input id="userImportFile" type="file" accept=".csv,text/csv" />
        </label>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
  <button id="downloadUserTemplateBtn" class="button user-add-button">Download Template</button>
  <button id="importUsersBtn" class="button primary user-add-button">Import CSV</button>
</div>
      </div>

      <div class="muted" style="margin-top:12px;">
        Example: <code>name,role,employeeId,badgeCode,status</code><br />
<code>Sally Smith,operator,331,1234-444-555,active</code>
      </div>

      <div id="importUsersResult" class="muted" style="margin-top:12px;"></div>
    </div>

    <div class="admin-card user-management-panel" style="margin-top:16px;">
      <div class="section-header">
        <div>
          <h2>User List</h2>
          <div class="muted">Single-line rows. Click Edit only when you need to change details or reset a PIN.</div>
        </div>
        <div style="display:flex; gap:8px;">
  <button id="refreshUsersBtn" class="button">Refresh</button>
  <button id="exportUsersBtn" class="button">Export CSV</button>
</div>
      </div>

      <div class="user-toolbar">
        <input id="userSearchInput" value="${escapeAttr(searchText)}" placeholder="Search users, roles, employee ID, or badge." />
        <select id="userRoleFilter">
          <option value="all" ${roleFilter === 'all' ? 'selected' : ''}>All roles (${users.length})</option>
          ${ROLES.map((role) => `<option value="${role.value}" ${roleFilter === role.value ? 'selected' : ''}>${role.label} (${roleCount(role.value)})</option>`).join('')}
        </select>
      </div>

      <div class="user-row-list">
        ${visibleUsers.length ? visibleUsers.map(renderUserRow).join('') : `<div class="muted user-empty-state">No users match this search.</div>`}
      </div>
    </div>
  `;

  wireEvents();
}

function renderUserRow(user) {
  const status = statusFor(user);
  const isEditing = editingUserId === user.id;
  const pinPreview = user.pin ? '••••' : 'No PIN';
  const roleClass = `role-${String(user.role || 'none').toLowerCase()}`;

  if (!isEditing) {
    return `
  <div class="user-row compact-user-row">
    <div class="user-main-line" style="display:grid; grid-template-columns: 180px 120px 110px 130px 1fr; align-items:center; gap:12px;">
      <strong>${escapeHtml(user.name || 'Unnamed User')}</strong>
      <span class="user-role-pill ${roleClass}">${roleLabel(user.role)}</span>
      <span class="status-pill ${status === 'active' ? 'running' : 'blocked'}">${status === 'active' ? 'Active' : 'Inactive'}</span>
      <span class="muted user-pin-preview">ID: ${escapeHtml(user.employeeId || user.pin || '—')}</span>
      <span class="muted user-pin-preview">${user.badgeCode ? `Badge: ${escapeHtml(user.badgeCode)}` : ''}</span>
    </div>

    <div class="user-row-actions">
  <button data-print-badge="${user.id}" class="button">Print Badge</button>
  <button data-edit-user="${user.id}" class="button">Edit</button>
  <button data-delete-user="${user.id}" class="button danger-outline">Delete</button>
</div>
  </div>
`;

  }

  return `
    <div class="user-row user-edit-row">
      <div class="section-header">
        <div>
          <h2>Edit ${escapeHtml(user.name || 'User')}</h2>
          <div class="muted">User ID: ${escapeHtml(user.id)}</div>
        </div>
      </div>

      <div class="user-edit-grid">
        <label>
          <span>Name</span>
          <input data-user-name="${user.id}" value="${escapeAttr(user.name || '')}" placeholder="Name" />
        </label>

        <label>
          <span>Role</span>
          <select data-user-role="${user.id}">
            ${ROLES.map((role) => `<option value="${role.value}" ${user.role === role.value ? 'selected' : ''}>${role.label}</option>`).join('')}
          </select>
        </label>

        <label>
          <span>PIN</span>
          <input data-user-pin="${user.id}" value="${escapeAttr(user.pin || '')}" inputmode="numeric" placeholder="PIN" autocomplete="new-password" />
        </label>


        <label>
  <span>Badge Code</span>
  <input data-user-badge-code="${user.id}" value="${escapeAttr(user.badgeCode || '')}" placeholder="Optional scan code" autocomplete="off" />
</label>

        <label>
          <span>Status</span>
          <select data-user-status="${user.id}">
            <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
      </div>

      <div class="user-edit-actions">
        <button data-save-user="${user.id}" class="button primary">Save Changes</button>
        <button data-cancel-edit class="button">Cancel</button>
        <button data-delete-user="${user.id}" class="button danger-outline">Delete User</button>
      </div>
    </div>
  `;
}

function wireEvents() {
 root.querySelector('#addUserBtn')?.addEventListener('click', handleAddUser);
root.querySelector('#importUsersBtn')?.addEventListener('click', handleImportUsers);
root.querySelector('#downloadUserTemplateBtn')?.addEventListener('click', downloadUserTemplateCsv);
root.querySelector('#refreshUsersBtn')?.addEventListener('click', loadAndRender);
root.querySelector('#exportUsersBtn')?.addEventListener('click', exportUsersCSV);

  root.querySelector('#userSearchInput')?.addEventListener('input', (event) => {
  searchText = event.target.value;
  editingUserId = null;

  render();

  const searchInput = root.querySelector('#userSearchInput');
  if (searchInput) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
});

  root.querySelector('#userRoleFilter')?.addEventListener('change', (event) => {
    roleFilter = event.target.value;
    editingUserId = null;
    render();
  });

  root.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      editingUserId = button.dataset.editUser;
      render();
    });
  });

  root.querySelectorAll('[data-cancel-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      editingUserId = null;
      render();
    });
  });

  root.querySelectorAll('[data-print-badge]').forEach((button) => {
  button.addEventListener('click', () => {
    printBadge(button.dataset.printBadge);
  });
});

  root.querySelectorAll('[data-save-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleSaveUser(button.dataset.saveUser);
    });
  });

  root.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDeleteUser(button.dataset.deleteUser);
    });
  });
}

async function handleAddUser() {
  const nameInput = root.querySelector('#newUserName');
  const employeeIdInput = root.querySelector('#newUserEmployeeId');
  const badgeCodeInput = root.querySelector('#newUserBadgeCode');
  const roleInput = root.querySelector('#newUserRole');
  const statusInput = root.querySelector('#newUserStatus');

  const name = nameInput?.value.trim() || '';
  const employeeId = employeeIdInput?.value.trim() || '';
  const badgeCode = badgeCodeInput?.value.trim() || '';
  const role = roleInput?.value || 'operator';
  const status = statusInput?.value || 'active';

  const pin = employeeId;

  if (!name) {
    alert('Name is required.');
    nameInput?.focus();
    return;
  }

  if (!employeeId && !badgeCode) {
    alert('Add Employee ID or Badge Code.');
    employeeIdInput?.focus();
    return;
  }

  if (employeeId && users.some((user) => String(user.employeeId || user.pin || '') === employeeId)) {
    alert('That Employee ID is already assigned.');
    employeeIdInput?.focus();
    return;
  }

  if (badgeCode && users.some((user) => String(user.badgeCode || '') === badgeCode)) {
    alert('That Badge Code is already assigned.');
    badgeCodeInput?.focus();
    return;
  }

  try {
    await addDoc(collection(db, 'users'), {
      name,
      employeeId,
      pin,
      badgeCode,
      role,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await addAdminLog(`Created user ${name} as ${roleLabel(role)}`);
    searchText = '';
    roleFilter = 'all';
    await loadAndRender();
  } catch (error) {
    console.error('❌ Add user failed:', error);
    alert('Add user failed.');
  }
}

async function handleImportUsers() {
  const fileInput = root.querySelector('#userImportFile');
  const result = root.querySelector('#importUsersResult');
  const file = fileInput?.files?.[0];

  if (!file) {
    alert('Choose a CSV file first.');
    return;
  }

  try {
    if (result) result.textContent = 'Reading CSV...';

    const text = await readFileAsText(file);
    const rows = parseCsv(text);

    if (!rows.length) {
      if (result) result.textContent = 'No rows found.';
      return;
    }

    if (!confirm(`Import ${rows.length} users?\n\nDuplicates and bad rows will be skipped.`)) {
      if (result) result.textContent = 'Import cancelled.';
      return;
    }

    const existingPins = new Set(users.map((user) => String(user.employeeId || user.pin || '').trim()).filter(Boolean));
    const existingBadges = new Set(users.map((user) => String(user.badgeCode || '').trim()).filter(Boolean));

    const incomingPins = new Set();
    const incomingBadges = new Set();

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      const user = normalizeImportRow(row);

      if (!user.name || !user.pin) {
        skipped += 1;
        errors.push(`Skipped row: missing name or PIN.`);
        continue;
      }

      if (existingPins.has(user.pin) || incomingPins.has(user.pin)) {
        skipped += 1;
        errors.push(`Skipped ${user.name}: duplicate PIN ${user.pin}.`);
        continue;
      }

      if (user.badgeCode && (existingBadges.has(user.badgeCode) || incomingBadges.has(user.badgeCode))) {
        skipped += 1;
        errors.push(`Skipped ${user.name}: duplicate Badge Code.`);
        continue;
      }

      incomingPins.add(user.pin);
      if (user.badgeCode) incomingBadges.add(user.badgeCode);

      await addDoc(collection(db, 'users'), {
        name: user.name,
       employeeId: user.employeeId || user.pin,
        pin: user.pin,
        badgeCode: user.badgeCode,
        role: user.role,
        status: user.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      imported += 1;
    }

    await addAdminLog(`Imported ${imported} users from CSV`);

    if (result) {
      result.innerHTML = `
        <strong>Import complete:</strong> ${imported} added, ${skipped} skipped.
        ${errors.length ? `<br>${errors.slice(0, 6).map(escapeHtml).join('<br>')}${errors.length > 6 ? '<br>More skipped rows were hidden.' : ''}` : ''}
      `;
    }

    await loadAndRender();
  } catch (error) {
    console.error('❌ Import users failed:', error);
    if (result) result.textContent = 'Import failed. Check the CSV format.';
    alert('Import failed.');
  }
}

async function handleSaveUser(userId) {
  const nameInput = root.querySelector(`[data-user-name="${userId}"]`);
  const pinInput = root.querySelector(`[data-user-pin="${userId}"]`);
  const badgeCodeInput = root.querySelector(`[data-user-badge-code="${userId}"]`);
  const roleInput = root.querySelector(`[data-user-role="${userId}"]`);
  const statusInput = root.querySelector(`[data-user-status="${userId}"]`);

  const name = nameInput?.value.trim() || '';
  const employeeId = pinInput?.value.trim() || ''; // ← this is your ID now
  const pin = employeeId; // keep system compatibility
  const badgeCode = badgeCodeInput?.value.trim() || '';
  const role = roleInput?.value || 'operator';
  const status = statusInput?.value || 'active';

  if (!name) {
    alert('Name is required.');
    nameInput?.focus();
    return;
  }

  if (!employeeId && !badgeCode) {
    alert('Add Employee ID or Badge Code.');
    pinInput?.focus();
    return;
  }

  const duplicateId = employeeId && users.some(
    (user) => user.id !== userId &&
    String(user.employeeId || user.pin || '') === employeeId
  );

  if (duplicateId) {
    alert('That Employee ID is already assigned.');
    pinInput?.focus();
    return;
  }

  const duplicateBadge = badgeCode && users.some(
    (user) => user.id !== userId &&
    String(user.badgeCode || '') === badgeCode
  );

  if (duplicateBadge) {
    alert('That Badge Code is already assigned.');
    badgeCodeInput?.focus();
    return;
  }

  try {
    await updateUserInFirestore(userId, {
      name,
      employeeId,
      pin,
      badgeCode,
      role,
      status
    });

    handleLiveSessionUpdate(userId, { name, employeeId, pin, badgeCode, role, status });
    await addAdminLog(`Updated user ${name}`);

    editingUserId = null;
    await loadAndRender();

  } catch (error) {
    console.error('❌ Save user failed:', error);
    alert('Save failed.');
  }
}

async function handleDeleteUser(userId) {
  const user = users.find((item) => item.id === userId);
  const name = user?.name || userId;
  const current = getSession() || getStoredSessionUser();

  if (current?.id === userId) {
    alert('You cannot delete the currently selected session user. Switch to another admin first.');
    return;
  }

  if (!confirm(`Delete user "${name}"?\n\nThis cannot be undone.`)) return;

  try {
    await deleteDoc(doc(db, 'users', userId));
    await addAdminLog(`Deleted user ${name}`);
    editingUserId = null;
    await loadAndRender();
  } catch (error) {
    console.error('❌ Delete user failed:', error);
    alert('Delete failed.');
  }
}

function normalizeImportRow(row) {
  const rawRole = String(row.role || row.Role || 'operator').trim();
  const normalizedRole = normalizeRole(rawRole);
  const rawStatus = String(row.status || row.Status || 'active').trim();

  const pin = String(row.pin || row.PIN || row.employeeId || row.EmployeeID || row.employeeID || '').trim();

  const badgeCode = String(
    row.badgeCode ||
    row.BadgeCode ||
    row.badge ||
    row.Badge ||
    row.scanCode ||
    row.ScanCode ||
    row.barcode ||
    row.Barcode ||
    ''
  ).trim();

  const firstName = String(row.firstName || row.FirstName || row.first_name || '').trim();
  const lastName = String(row.lastName || row.LastName || row.last_name || '').trim();
  const fullName = String(row.name || row.Name || '').trim();
  const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
  name,
  pin,
  employeeId: String(row.employeeId || '').trim(),
  badgeCode,
  role: normalizedRole,
  status: normalizeStatus(rawStatus)
};
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase().replaceAll(' ', '').replaceAll('_', '');

  if (role === 'operator' || role === 'op') return 'operator';
  if (role === 'diesetter' || role === 'die') return 'dieSetter';
  if (role === 'supervisor' || role === 'super') return 'supervisor';
  if (role === 'admin' || role === 'administrator') return 'admin';

  return 'operator';
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status === 'inactive' || status === 'disabled' ? 'inactive' : 'active';
}

function parseCsv(text) {
  const rows = [];
  const lines = String(text || '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').filter((line) => line.trim());

  if (lines.length < 2) return rows;

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result || '');
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
function downloadUserTemplateCsv() {
  const csv = [
    'name,role,employeeId,badgeCode,status',
    'Sally Smith,operator,331,,active',
    'Bob Jones,dieSetter,442,A123-567B-6754,active',
    'Mike Carter,supervisor,553,,active',
    'Lisa Brown,admin,664,~NTPKIO95-PZKD-CEE5,active'
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'user-import-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}




function handleLiveSessionUpdate(userId, updates) {
  const current = getSession() || getStoredSessionUser();
  if (!current || current.id !== userId) return;

  const updatedUser = { ...current, ...updates };
  setSession(updatedUser);
  setStoredSessionUser(updatedUser);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function exportUsersCSV() {
  if (!users.length) {
    alert('No users to export.');
    return;
  }

  const headers = ['name', 'employeeId', 'role', 'pin', 'badgeCode', 'status'];

  const rows = users.map(u => [
    u.name || '',
    u.employeeId || '',
    u.role || '',
    u.pin || '',
    statusFor(u)
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(val => `"${String(val).replaceAll('"', '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `users_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printBadge(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const name = user.name || 'Unnamed';
  const id = user.employeeId || user.pin || '';
  const badge = user.badgeCode || '';

  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
<html>
<head>
<title>Badge</title>
<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
  }

  .badge {
    width: 3.375in;
    height: 2.125in;
    border: 2px solid black;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px;
    box-sizing: border-box;
  }

  .top {
    font-size: 14px;
    font-weight: bold;
    text-align: center;
  }

  .name {
    font-size: 20px;
    font-weight: bold;
    text-align: center;
  }

  .id {
    font-size: 14px;
    text-align: center;
  }

  .barcode {
    font-size: 12px;
    text-align: center;
    word-break: break-all;
  }

  .footer {
    font-size: 10px;
    text-align: center;
    opacity: 0.6;
  }

  @media print {
    body { margin: 0; }
  }
</style>
</head>

<body>
  <div class="badge">

    <!-- TOP = CLIENT BRAND -->
    <div class="top">
      COMPANY NAME
    </div>

    <!-- CENTER -->
    <div>
      <div class="name">${name}</div>
      <div class="id">ID: ${id}</div>
    </div>

    <!-- BARCODE / CODE -->
    <div class="barcode">
      ${badge || id}
    </div>

    <!-- BOTTOM = YOUR SYSTEM -->
    <div class="footer">
      Powered by One T Media Group
    </div>

  </div>

  <script>
    window.onload = function() {
      window.print();
      window.close();
    }
  <\/script>

</body>
</html>
`);

  printWindow.document.close();
}