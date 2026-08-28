const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const assetsDir = __dirname;
const iconPngPath = path.join(assetsDir, 'icon.png');
const trayIconPath = path.join(assetsDir, 'tray-icon.png');

if (fs.existsSync(iconPngPath)) {
  const img = nativeImage.createFromPath(iconPngPath);
  
  // Tray icon 32x32 / 16x16
  const trayImg = img.resize({ width: 32, height: 32, quality: 'best' });
  fs.writeFileSync(trayIconPath, trayImg.toPNG());
  console.log('[Assets] Created tray-icon.png');
}

// Vector SVG replication
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="frameGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="35%" stop-color="#818cf8"/>
      <stop offset="70%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#f472b6"/>
    </linearGradient>
    <linearGradient id="camGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2dd4bf"/>
      <stop offset="45%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
  </defs>

  <!-- Dashed Rounded Selection Frame -->
  <rect x="76" y="48" width="388" height="388" rx="44" ry="44" 
        fill="none" stroke="url(#frameGrad)" stroke-width="32" 
        stroke-linecap="round" stroke-linejoin="round"
        stroke-dasharray="0 88 56 36 56 36 56 36"/>

  <!-- Camera Body -->
  <path d="M 148 270 C 148 250, 162 236, 180 236 L 204 236 C 218 236, 232 248, 240 260 L 250 272 L 312 272 C 342 272, 368 298, 368 328 L 368 418 C 368 448, 342 472, 312 472 L 104 472 C 74 472, 48 448, 48 418 L 48 328 C 48 298, 74 270, 104 270 Z" 
        fill="url(#camGrad)" />

  <!-- Lens Outer (White) -->
  <circle cx="208" cy="372" r="60" fill="#ffffff" />

  <!-- Lens Inner (Cutout) -->
  <circle cx="208" cy="372" r="30" fill="#2dd4bf" />
</svg>
`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svg.trim());
console.log('[Assets] Created icon.svg');
