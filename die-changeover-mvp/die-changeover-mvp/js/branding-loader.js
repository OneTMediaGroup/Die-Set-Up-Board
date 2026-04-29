import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';

const DEFAULT_SETTINGS = {
  brandingMode: 'text',
  brandText: 'MAGNA',
  logoUrl: ''
};

async function applyBranding() {
  let settings = { ...DEFAULT_SETTINGS };

  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists()) settings = { ...settings, ...snap.data() };
  } catch (error) {
    console.error('Branding load failed:', error);
  }

  document.querySelectorAll('.brand-logo').forEach((el) => {
    if (settings.brandingMode === 'logo' && settings.logoUrl) {
      el.innerHTML = `
        <img
          src="${escapeAttr(settings.logoUrl)}"
          alt="${escapeAttr(settings.brandText || 'Logo')}"
          style="max-width:180px; max-height:56px; object-fit:contain;"
        />
      `;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
    } else {
      el.textContent = settings.brandText || 'MAGNA';
    }
  });
}

function escapeAttr(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

applyBranding();