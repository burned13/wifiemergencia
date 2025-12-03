/* eslint-disable */
const path = require('path');
const fs = require('fs');
const pngToIco = require('png-to-ico');

const SRC = path.resolve(__dirname, '..', 'assets', 'images', 'icon.png');
const OUT = path.resolve(__dirname, '..', 'dist', 'favicon.ico');

async function run() {
  if (!fs.existsSync(SRC)) {
    console.error('No existe assets/images/icon.png. Ejecutá gen:icons primero.');
    process.exit(2);
  }
  console.log('Generando favicon.ico desde', SRC);
  const buf = await pngToIco(SRC);
  fs.writeFileSync(OUT, buf);
  console.log('OK:', OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });

