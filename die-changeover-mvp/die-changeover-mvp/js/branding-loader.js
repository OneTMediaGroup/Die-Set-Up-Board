import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';

const DEFAULT_SETTINGS = {
  brandingMode: 'text',
  brandText: 'MAGNA',
  logoUrl: ''
};

export async function applyBranding() {
  let settings = { ...DEFAULT_SETTINGS };

  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists()) {
      settings = { ...settings, ...snap.data() };
    }
  } catch (error) {
    console.error('❌ Failed to load branding:', error);
  }

  const brandElements = document.querySelectorAll('.brand-logo');
  brandElements.forEach((element) => {
    if (settings.brandingMode === 'logo' && settings.logoUrl) {
      element.innerHTML = `
        <img
          src="${escapeAttr(settings.logoUrl)}"
          alt="${escapeAttr(settings.brandText || 'Brand Logo')}"
          style="max-width:180px; max-height:56px; object-fit:contain;"
        />
      `;
      element.style.display = 'flex';
      element.style.alignItems = 'center';
    } else {
      element.textContent = settings.brandText || 'MAGNA';
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