const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');

if (fs.existsSync(pngPath)) {
  const pngBuffer = fs.readFileSync(pngPath);
  const size = pngBuffer.length;
  
  // Create ICO header (6 bytes) + 1 directory entry (16 bytes) = 22 bytes
  const header = Buffer.alloc(22);
  
  // ICONDIR
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // Number of images = 1
  
  // ICONDIRENTRY
  header.writeUInt8(0, 6);    // Width: 0 means 256px
  header.writeUInt8(0, 7);    // Height: 0 means 256px
  header.writeUInt8(0, 8);    // Color palette: 0
  header.writeUInt8(0, 9);    // Reserved: 0
  header.writeUInt16LE(1, 10); // Color planes: 1
  header.writeUInt16LE(32, 12); // Bits per pixel: 32
  header.writeUInt32LE(size, 14); // Image data size
  header.writeUInt32LE(22, 18);   // Image data offset (22 bytes)
  
  const icoBuffer = Buffer.concat([header, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('[ICO] Generated icon.ico successfully (' + icoBuffer.length + ' bytes)');
}
