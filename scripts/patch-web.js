/* eslint-disable */
const fs = require('fs');
const path = require('path');

const INDEX = path.resolve(__dirname, '..', 'dist', 'index.html');

function patchTitle(html) {
  return html.replace(/<title>[^<]*<\/title>/i, '<title>WiFi Emergencia</title>');
}

async function run() {
  if (!fs.existsSync(INDEX)) {
    console.error('No existe dist/index.html. Ejecutá: npx expo export');
    process.exit(2);
  }
  let html = fs.readFileSync(INDEX, 'utf8');
  html = patchTitle(html);
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log('Patched index.html title → WiFi Emergencia');
}

run().catch((e) => { console.error(e); process.exit(1); });

