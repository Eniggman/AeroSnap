const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const assetsDir = path.join(__dirname);
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate Aero Camera SVG Icon
const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="aeroSphere" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="25%" stop-color="#38bdf8" />
      <stop offset="70%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </radialGradient>
    <linearGradient id="lensGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
    <linearGradient id="gloss" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="40%" stop-color="#ffffff" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- Background Aero Bubble Glass -->
  <rect x="24" y="24" width="208" height="208" rx="52" fill="url(#aeroSphere)" />
  <rect x="24" y="24" width="208" height="208" rx="52" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.9" />

  <!-- Glossy overlay -->
  <path d="M 28 76 C 28 48, 48 28, 76 28 L 180 28 C 208 28, 228 48, 228 76 C 228 110, 180 130, 128 130 C 76 130, 28 110, 28 76 Z" fill="url(#gloss)" />

  <!-- Camera Body & Lens -->
  <circle cx="128" cy="132" r="54" fill="#0f172a" opacity="0.65" />
  <circle cx="128" cy="132" r="46" fill="url(#lensGrad)" />
  <circle cx="128" cy="132" r="28" fill="#ffffff" opacity="0.8" />
  <circle cx="128" cy="132" r="16" fill="#0284c7" />

  <!-- Flash Light -->
  <circle cx="180" cy="76" r="14" fill="#ffea00" />
  <circle cx="180" cy="76" r="8" fill="#ffffff" />
</svg>
`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svg.trim());
console.log('Icon SVG created successfully');
