#!/usr/bin/env node
/**
 * ساخت ست آیکون دارینو از لوگوی برند.
 *
 * منبع: assets/brand/logo.png (حرف D سه‌بعدی با نمودار و سپر، پس‌زمینه‌ی شفاف)
 * خروجی‌ها با پس‌زمینه‌ی سرمه‌ای #0B1320 و حاشیه‌ی امن برای آیکون تطبیقی اندروید ساخته می‌شوند.
 *
 * اجرا: node scripts/generate-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');

const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'brand', 'logo.png');
const OUT = path.join(ROOT, 'assets');

const BACKGROUND = { r: 0x0b, g: 0x13, b: 0x20, alpha: 1 };

if (!fs.existsSync(SOURCE)) {
  console.error(`لوگوی برند پیدا نشد: ${SOURCE}`);
  process.exit(1);
}

/** لوگو را داخل یک قاب مربعی با حاشیه‌ی مشخص می‌گذارد. */
async function placeLogo(size, paddingRatio) {
  const inner = Math.round(size * (1 - paddingRatio * 2));

  const logo = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer();

  return { logo, inner };
}

async function renderWithBackground(size, paddingRatio) {
  const { logo } = await placeLogo(size, paddingRatio);

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderTransparent(size, paddingRatio) {
  const { logo } = await placeLogo(size, paddingRatio);

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * نسخه‌ی تک‌رنگ برای «آیکون‌های هماهنگ با تم» اندروید ۱۳:
 * آلفا از روشنایی پیکسل گرفته می‌شود تا فرم حرف D و نمودار حفظ شود.
 */
async function renderMonochrome(size, paddingRatio) {
  const { inner } = await placeLogo(size, paddingRatio);

  const { data, info } = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.alloc(inner * inner * 4);

  for (let index = 0; index < inner * inner; index += 1) {
    const r = data[index * info.channels];
    const g = data[index * info.channels + 1];
    const b = data[index * info.channels + 2];
    const sourceAlpha = data[index * info.channels + 3] / 255;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const alpha = Math.max(0, Math.min(1, (luminance - 26) / 120)) * sourceAlpha;

    pixels[index * 4] = 255;
    pixels[index * 4 + 1] = 255;
    pixels[index * 4 + 2] = 255;
    pixels[index * 4 + 3] = Math.round(alpha * 255);
  }

  const silhouette = await sharp(pixels, {
    raw: { width: inner, height: inner, channels: 4 },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: silhouette, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderSolid(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function write(name, buffer) {
  fs.writeFileSync(path.join(OUT, name), buffer);
  console.log(`${name}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

(async () => {
  const SIZE = 1024;

  // آیکون اصلی و اسپلش: لوگو روی سرمه‌ای برند
  write('icon.png', await renderWithBackground(SIZE, 0.1));
  write('splash-icon.png', await renderTransparent(SIZE, 0.16));

  // آیکون تطبیقی: پس‌زمینه‌ی یکدست + پیش‌زمینه‌ی شفاف با حاشیه‌ی امن (۶۶٪ مرکزی)
  write('android-icon-background.png', await renderSolid(SIZE));
  write('android-icon-foreground.png', await renderTransparent(SIZE, 0.225));
  write('android-icon-monochrome.png', await renderMonochrome(SIZE, 0.225));
})();
