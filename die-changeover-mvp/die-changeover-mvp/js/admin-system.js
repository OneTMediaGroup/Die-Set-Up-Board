import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { db, storage } from './firebase-config.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;

let settings = {
  brandingMode: 'text',
  brandText: 'MAGNA',
  logoUrl: ''
};

export async function mountSystemTool(container) {
  root = container;
  await loadSettings();
  render();
  return () => {};
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists()) {
      settings = { ...settings, ...snap.data() };
    }
  } catch (error) {
    console.error('❌ Failed to load settings:', error);
  }
}

function render() {
  root.innerHTML = `
    <div class="admin-content-header">
      <div>
        <h2>System Controls</h2>
        <p class="muted">Branding and global system settings.</p>
      </div>
    </div>

    <div class="admin-card">
      <h2>Branding</h2>

      <div style="display:grid; gap:14px; margin-top:16px;">
        
        <label>
          <span>Mode</span>
          <select id="brandingMode">
            <option value="text" ${settings.brandingMode === 'text' ? 'selected' : ''}>Text</option>
            <option value="logo" ${settings.brandingMode === 'logo' ? 'selected' : ''}>Logo</option>
          </select>
        </label>

        <label>
          <span>Brand Text</span>
          <input id="brandText" value="${escapeAttr(settings.brandText)}" />
        </label>

        <label>
          <span>Upload Logo</span>
          <input type="file" id="logoUpload" accept="image/*" />
        </label>

        <div class="card" style="padding:14px;">
          <strong>Preview</strong>
          <div id="preview" style="margin-top:10px;"></div>
        </div>

        <button id="saveBtn" class="button primary">Save</button>
      </div>
    </div>

    <div class="muted" style="margin-top:16px; text-align:center;">
      © One T Media Group
    </div>
  `;

  wireEvents();
  renderPreview();
}

/* ---------- EVENTS ---------- */

function wireEvents() {
  root.querySelector('#brandingMode')?.addEventListener('change', renderPreview);
  root.querySelector('#brandText')?.addEventListener('input', renderPreview);
  root.querySelector('#logoUpload')?.addEventListener('change', handleUpload);
  root.querySelector('#saveBtn')?.addEventListener('click', saveSettings);
}

/* ---------- UPLOAD ---------- */

async function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const storageRef = ref(storage, `branding/logo_${Date.now()}`);
    await uploadBytes(storageRef, file);

    const url = await getDownloadURL(storageRef);
    settings.logoUrl = url;

    renderPreview();
  } catch (error) {
    console.error('❌ Upload failed:', error);
    alert('Upload failed');
  }
}

/* ---------- PREVIEW ---------- */

function renderPreview() {
  const mode = root.querySelector('#brandingMode')?.value;
  const text = root.querySelector('#brandText')?.value || 'MAGNA';
  const preview = root.querySelector('#preview');

  if (!preview) return;

  if (mode === 'logo' && settings.logoUrl) {
    preview.innerHTML = `
      <img src="${settings.logoUrl}" style="max-height:60px;" />
    `;
  } else {
    preview.innerHTML = `
      <div style="font-size:28px; font-weight:700;">${escapeHtml(text)}</div>
    `;
  }
}

/* ---------- SAVE ---------- */

async function saveSettings() {
  const brandingMode = root.querySelector('#brandingMode')?.value;
  const brandText = root.querySelector('#brandText')?.value;

  try {
    settings = {
      ...settings,
      brandingMode,
      brandText,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });

    await addAdminLog(`Updated branding (${brandingMode})`);

    alert('Saved');
  } catch (error) {
    console.error('❌ Save failed:', error);
    alert('Save failed');
  }
}

/* ---------- HELPERS ---------- */

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}