import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { addAdminLog } from './admin-helpers.js';

let root = null;

let settings = {
  brandingMode: 'text',
  brandText: 'Your Brand',
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

<div class="muted" style="margin-top:4px;">
  Recommended: wide logo (2:1 or 3:1), ~300×100px for best fit.
</div>


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

    renderPreview();
  });

  document.getElementById('saveBrandingBtn')?.addEventListener('click', saveBrandingSettings);

['brandingMode','brandText','logoUrl'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    renderBrandingPreview({
      brandingMode: document.getElementById('brandingMode').value,
      brandText: document.getElementById('brandText').value,
      logoUrl: document.getElementById('logoUrl').value
    });
  });
});

  root.querySelector('#logoFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadToCloudinary(file);

      settings.logoUrl = url;
      root.querySelector('#brandingMode').value = 'logo';
      root.querySelector('#textModeBlock').style.display = 'none';
      root.querySelector('#logoModeBlock').style.display = '';

      const input = root.querySelector('#logoUrl');
      if (input) input.value = url;

      renderPreview();

      alert('Logo uploaded successfully.');

      
    } catch (error) {
      console.error('❌ Logo upload failed:', error);
      alert('Logo upload failed.');
    }
  });

  root.querySelector('#brandText')?.addEventListener('input', renderPreview);
  root.querySelector('#logoUrl')?.addEventListener('input', renderPreview);
  root.querySelector('#saveSystemSettingsBtn')?.addEventListener('click', saveSettings);
}

function renderPreview() {
  const mode = root.querySelector('#brandingMode')?.value || 'text';
  const text = root.querySelector('#brandText')?.value.trim() || 'Your Brand';
  const logoUrl = root.querySelector('#logoUrl')?.value.trim() || '';
  const preview = root.querySelector('#brandPreview');

  if (!preview) return;

  if (mode === 'logo' && logoUrl) {
    preview.innerHTML = `<img src="${escapeAttr(logoUrl)}" alt="Brand logo" style="max-height:64px; max-width:220px; object-fit:contain;" />`;
  } else {
    preview.innerHTML = `<div class="brand-logo large">${escapeHtml(text)}</div>`;
  }
}

function renderBrandingSettings(settings) {
  return `
    <div class="admin-card" style="margin-top:16px;">
      <div class="section-header">
        <div>
          <h2>Plant Branding</h2>
          <div class="muted">Customize badge + system branding</div>
        </div>
      </div>

      <div class="user-add-grid">
        <label>
          <span>Brand Mode</span>
          <select id="brandingMode">
            <option value="text" ${settings.brandingMode === 'text' ? 'selected' : ''}>Text</option>
            <option value="logo" ${settings.brandingMode === 'logo' ? 'selected' : ''}>Logo</option>
          </select>
        </label>

        <label>
          <span>Brand Text</span>
          <input id="brandText" value="${escapeAttr(settings.brandText || '')}" placeholder="Floor Flow" />
        </label>

        <label>
          <span>Logo URL</span>
          <input id="logoUrl" value="${escapeAttr(settings.logoUrl || '')}" placeholder="https://..." />
        </label>

        <button id="saveBrandingBtn" class="button primary">Save Branding</button>
      </div>

      <div id="brandingPreview" style="margin-top:16px;"></div>
    </div>
  `;
}


async function loadBrandingSettings() {
  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists()) return snap.data();
  } catch (e) {
    console.error(e);
  }

  return {
    brandingMode: 'text',
    brandText: 'Floor Flow',
    logoUrl: ''
  };
}

function renderBrandingPreview(settings) {
  const preview = document.getElementById('brandingPreview');
  if (!preview) return;

  preview.innerHTML = `
    <div style="width:320px; border:1px solid #ccc; padding:10px;">
      <div style="text-align:center; margin-bottom:8px;">
        ${
          settings.brandingMode === 'logo' && settings.logoUrl
            ? `<img src="${escapeAttr(settings.logoUrl)}" style="max-height:40px;" />`
            : escapeHtml(settings.brandText || 'Floor Flow')
        }
      </div>

      <div style="text-align:center; font-weight:bold;">John Doe</div>
      <div style="text-align:center; font-size:12px;">OPERATOR</div>
      <div style="text-align:center; margin-top:4px;">ID: 123</div>

      <div style="text-align:center; margin-top:6px; font-size:10px;">
        QR + Barcode Preview
      </div>
    </div>
  `;
}


async function saveBrandingSettings() {
  const brandingMode = document.getElementById('brandingMode').value;
  const brandText = document.getElementById('brandText').value.trim();
  const logoUrl = document.getElementById('logoUrl').value.trim();

  try {
    await setDoc(doc(db, 'system', 'settings'), {
      brandingMode,
      brandText,
      logoUrl,
      updatedAt: new Date().toISOString()
    });

    alert('Branding saved');
    renderBrandingPreview({ brandingMode, brandText, logoUrl });

  } catch (e) {
    console.error(e);
    alert('Save failed');
  }
}

async function saveSettings() {
  const brandingMode = root.querySelector('#brandingMode')?.value || 'text';
  const brandText = root.querySelector('#brandText')?.value.trim() || 'Your Brand';
  const logoInputValue = root.querySelector('#logoUrl')?.value.trim() || '';

  try {
    settings = {
      ...settings,
      brandingMode,
      brandText,
      logoUrl: logoInputValue ? logoInputValue : settings.logoUrl,
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