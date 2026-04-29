import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
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
    console.error('❌ Failed to load system settings:', error);
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
      <p class="muted">Choose text branding or a logo image for the app header/sidebar.</p>

      <div style="display:grid; gap:14px; margin-top:16px;">
        <label>
          <span>Branding Mode</span>
          <select id="brandingMode">
            <option value="text" ${settings.brandingMode === 'text' ? 'selected' : ''}>Text</option>
            <option value="logo" ${settings.brandingMode === 'logo' ? 'selected' : ''}>Logo Image</option>
          </select>
        </label>

        <div id="textModeBlock" style="${settings.brandingMode === 'text' ? '' : 'display:none;'}">
  <label>
    <span>Brand Text</span>
    <input id="brandText" value="${escapeAttr(settings.brandText)}" />
  </label>
</div>

<div id="logoModeBlock" style="${settings.brandingMode === 'logo' ? '' : 'display:none;'}">
  <label>
    <span>Upload Logo</span>
    <input type="file" id="logoFileInput" accept="image/*" />
  </label>

  <div class="muted">Or paste a URL</div>

  <input id="logoUrl" value="${escapeAttr(settings.logoUrl)}" placeholder="https://..." />
</div>
        

        <div class="card" style="padding:14px;">
          <strong>Preview</strong>
          <div id="brandPreview" style="margin-top:12px;"></div>
        </div>

        <button id="saveSystemSettingsBtn" class="button primary">Save Branding</button>
      </div>
    </div>

    <div class="muted" style="margin-top:16px; text-align:center;">
      © One T Media Group
    </div>
  `;

  wireEvents();
  renderPreview();
}

async function uploadToCloudinary(file) {
  const cloudName = 'dnpqzmoua';
  const uploadPreset = 'branding_upload';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();

  if (!data.secure_url) {
    throw new Error('Upload failed');
  }

  return data.secure_url;
}



function wireEvents() {
  root.querySelector('#brandingMode')?.addEventListener('change', () => {
    const mode = root.querySelector('#brandingMode')?.value || 'text';

    root.querySelector('#textModeBlock').style.display = mode === 'text' ? '' : 'none';
    root.querySelector('#logoModeBlock').style.display = mode === 'logo' ? '' : 'none';
root.querySelector('#logoFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const url = await uploadToCloudinary(file);

    // auto-fill URL field
    const input = root.querySelector('#logoUrl');
    if (input) input.value = url;

    renderPreview();

    alert('Logo uploaded successfully!');
  } catch (err) {
    console.error(err);
    alert('Upload failed');
  }
});



    renderPreview();
  });

  root.querySelector('#brandText')?.addEventListener('input', renderPreview);
  root.querySelector('#logoUrl')?.addEventListener('input', renderPreview);
  root.querySelector('#saveSystemSettingsBtn')?.addEventListener('click', saveSettings);
}

function renderPreview() {
  const mode = root.querySelector('#brandingMode')?.value || 'text';
  const text = root.querySelector('#brandText')?.value.trim() || 'MAGNA';
  const logoUrl = root.querySelector('#logoUrl')?.value.trim() || '';
  const preview = root.querySelector('#brandPreview');

  if (!preview) return;

  if (mode === 'logo' && logoUrl) {
    preview.innerHTML = `<img src="${escapeAttr(logoUrl)}" alt="Brand logo" style="max-height:64px; max-width:220px; object-fit:contain;" />`;
  } else {
    preview.innerHTML = `<div class="brand-logo large">${escapeHtml(text)}</div>`;
  }
}

async function saveSettings() {
  const brandingMode = root.querySelector('#brandingMode')?.value || 'text';
  const brandText = root.querySelector('#brandText')?.value.trim() || 'MAGNA';
  const logoUrl = root.querySelector('#logoUrl')?.value.trim() || '';

  try {
    settings = {
      brandingMode,
      brandText,
      logoUrl,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
    await addAdminLog(`Updated system branding to ${brandingMode}`);

    alert('Branding saved.');
    render();
  } catch (error) {
    console.error('❌ Failed to save system settings:', error);
    alert('Save failed.');
  }
}

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