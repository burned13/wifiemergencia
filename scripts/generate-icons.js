/* eslint-disable */
const fs = require('fs');
const path = require('path');
let sharp;
try { sharp = require('sharp'); } catch (e) {
  console.error('Falta la dependencia "sharp". Ejecutá: npm i -D sharp');
  process.exit(1);
}

const CANDIDATES = [
  'icon-source.png',
  'icon-source.jpg',
  'icon-source.jpeg',
  'Icon-Source.png',
  'Icon-Source.jpg',
  'icon_source.png',
  'icon_source.jpg',
];
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'images');
const SRC = (() => {
  for (const name of CANDIDATES) {
    const p = path.resolve(OUT_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  const fallback = path.resolve(OUT_DIR, 'android-icon-foreground.png');
  if (fs.existsSync(fallback)) return fallback;
  return path.resolve(OUT_DIR, 'icon-source.png');
})();
const ICON_OUT = path.join(OUT_DIR, 'icon.png');
const ANDROID_FOREGROUND_OUT = path.join(OUT_DIR, 'android-icon-foreground.png');

async function run() {
  if (!fs.existsSync(SRC)) {
    console.error(`No se encontró la imagen de origen: ${SRC}`);
    console.error('Guardá tu imagen como icon-source.(png|jpg) en assets/images/ y volvé a ejecutar.');
    process.exit(2);
  }

  console.log('Generando iconos desde', SRC);

  // Icono principal 1024x1024, priorizando la parte superior para evitar texto inferior
  await sharp(SRC)
    .resize(1024, 1024, { fit: 'cover', position: 'top' })
    .png({ quality: 100 })
    .toFile(ICON_OUT);
  console.log('OK:', ICON_OUT);

// Android adaptive foreground 432x432 con padding y fondo transparente real
async function generateAndroidForegroundTransparent() {
  // Escalar contenido a 360x360 y agregar padding 36px por lado para llegar a 432x432
  const { data, info } = await sharp(SRC)
    .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buf = data;
  const channels = info.channels; // RGBA esperado
  // Hacer transparente píxeles blancos o casi blancos (fondo horneado)
  for (let i = 0; i < buf.length; i += channels) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r > 245 && g > 245 && b > 245) {
      buf[i + 3] = 0; // alpha 0
    }
  }

  await sharp(buf, { raw: { width: info.width, height: info.height, channels } })
    .extend({ top: 36, bottom: 36, left: 36, right: 36, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 100 })
    .toFile(ANDROID_FOREGROUND_OUT);
}

await generateAndroidForegroundTransparent();
console.log('OK (transparent + padded):', ANDROID_FOREGROUND_OUT);

  console.log('Listo. Actualizá la app y verificá los iconos.');
}

run().catch((e) => { console.error(e); process.exit(3); });
