#!/usr/bin/env node
/**
 * ساخت آیکون‌های دارینو بدون هیچ کتابخانه‌ی گرافیکی.
 *
 * یک رستر ساده (بدون canvas) با سوپرسمپلینگ ۲× و کدگذار PNG روی zlib:
 * پس‌زمینه‌ی سرمه‌ای عمیق #0B1320، کیف‌پول زمردی و فلش صعودی طلایی.
 *
 * خروجی‌ها:
 *   assets/icon.png
 *   assets/android-icon-foreground.png
 *   assets/android-icon-background.png
 *   assets/android-icon-monochrome.png
 *   assets/splash-icon.png
 *
 * اجرا: node scripts/generate-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'assets');
const SS = 2; // سوپرسمپل

const NAVY = [0x0b, 0x13, 0x20];
const NAVY_LIGHT = [0x12, 0x23, 0x3b];
const EMERALD = [0x10, 0xb9, 0x81];
const EMERALD_LIGHT = [0x6e, 0xe7, 0xb7];
const EMERALD_DARK = [0x05, 0x96, 0x69];
const GOLD = [0xf5, 0xc4, 0x53];
const GOLD_LIGHT = [0xff, 0xdd, 0x8a];

// ---------- بوم و ترکیب رنگ ----------

function createCanvas(size) {
  return { size, data: new Float64Array(size * size * 4) };
}

function blendPixel(canvas, x, y, color) {
  const { size, data } = canvas;
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const [r, g, b, a = 1] = color;
  if (a <= 0) return;

  const index = (y * size + x) * 4;
  const dstAlpha = data[index + 3];
  const outAlpha = a + dstAlpha * (1 - a);

  if (outAlpha <= 0) {
    data[index] = data[index + 1] = data[index + 2] = data[index + 3] = 0;
    return;
  }

  data[index] = (r * a + data[index] * dstAlpha * (1 - a)) / outAlpha;
  data[index + 1] = (g * a + data[index + 1] * dstAlpha * (1 - a)) / outAlpha;
  data[index + 2] = (b * a + data[index + 2] * dstAlpha * (1 - a)) / outAlpha;
  data[index + 3] = outAlpha;
}

function mix(first, second, t) {
  return [
    first[0] + (second[0] - first[0]) * t,
    first[1] + (second[1] - first[1]) * t,
    first[2] + (second[2] - first[2]) * t,
  ];
}

// ---------- اشکال ----------

function eachPixelInBox(canvas, x, y, width, height, visitor) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(canvas.size, Math.ceil(x + width));
  const endY = Math.min(canvas.size, Math.ceil(y + height));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      visitor(px + 0.5, py + 0.5, px, py);
    }
  }
}

function insideRoundRect(px, py, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const cx = Math.min(Math.max(px, x + r), x + width - r);
  const cy = Math.min(Math.max(py, y + r), y + height - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundRect(canvas, rect, radius, colorAt) {
  eachPixelInBox(canvas, rect.x, rect.y, rect.w, rect.h, (px, py, ix, iy) => {
    if (insideRoundRect(px, py, rect.x, rect.y, rect.w, rect.h, radius)) {
      const color = colorAt(px, py);
      if (color) blendPixel(canvas, ix, iy, color);
    }
  });
}

function punchRoundRect(canvas, rect, radius) {
  eachPixelInBox(canvas, rect.x, rect.y, rect.w, rect.h, (px, py, ix, iy) => {
    if (insideRoundRect(px, py, rect.x, rect.y, rect.w, rect.h, radius)) {
      canvas.data[(iy * canvas.size + ix) * 4 + 3] = 0;
    }
  });
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

function fillSegment(canvas, from, to, thickness, colorAt) {
  const half = thickness / 2;
  const minX = Math.min(from.x, to.x) - half - 1;
  const minY = Math.min(from.y, to.y) - half - 1;
  const width = Math.abs(to.x - from.x) + thickness + 2;
  const height = Math.abs(to.y - from.y) + thickness + 2;

  eachPixelInBox(canvas, minX, minY, width, height, (px, py, ix, iy) => {
    const { distance, t } = distanceToSegment(px, py, from.x, from.y, to.x, to.y);
    if (distance <= half) {
      const color = colorAt(px, py, t);
      if (color) blendPixel(canvas, ix, iy, color);
    }
  });
}

function insideTriangle(px, py, a, b, c) {
  const sign = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const d1 = sign({ x: px, y: py }, a, b);
  const d2 = sign({ x: px, y: py }, b, c);
  const d3 = sign({ x: px, y: py }, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function fillTriangle(canvas, a, b, c, colorAt) {
  const minX = Math.min(a.x, b.x, c.x) - 1;
  const minY = Math.min(a.y, b.y, c.y) - 1;
  const width = Math.max(a.x, b.x, c.x) - minX + 2;
  const height = Math.max(a.y, b.y, c.y) - minY + 2;

  eachPixelInBox(canvas, minX, minY, width, height, (px, py, ix, iy) => {
    if (insideTriangle(px, py, a, b, c)) {
      const color = colorAt(px, py);
      if (color) blendPixel(canvas, ix, iy, color);
    }
  });
}

function fillGlow(canvas, cx, cy, radius, color, strength) {
  eachPixelInBox(canvas, cx - radius, cy - radius, radius * 2, radius * 2, (px, py, ix, iy) => {
    const distance = Math.hypot(px - cx, py - cy) / radius;
    if (distance >= 1) return;
    const falloff = (1 - distance) ** 2;
    blendPixel(canvas, ix, iy, [color[0], color[1], color[2], strength * falloff]);
  });
}

// ---------- پس‌زمینه ----------

function drawBackground(canvas) {
  const { size, data } = canvas;
  const cx = size * 0.5;
  const cy = size * 0.42;
  const maxDistance = Math.hypot(size * 0.5, size * 0.5) * 0.86;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxDistance);
      const [r, g, b] = mix(NAVY_LIGHT, NAVY, t ** 0.8);
      const index = (y * size + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 1;
    }
  }
}

// ---------- نشان (کیف‌پول + فلش) ----------

/**
 * نشان در فضای نرمال ۰..۱ رسم می‌شود و با scale/offset روی بوم می‌نشیند.
 * mono=true یعنی همه‌ی شکل‌ها سفید یکدست (برای آیکون Monochrome اندروید).
 */
function drawGlyph(canvas, options) {
  const { scale, offsetX, offsetY, mono = false, glow = true } = options;
  const S = canvas.size;

  const px = (u) => (offsetX + u * scale) * S;
  const py = (v) => (offsetY + v * scale) * S;
  const len = (value) => value * scale * S;

  const solid = (color, alpha = 1) => () => [color[0], color[1], color[2], alpha];

  if (!mono && glow) {
    fillGlow(canvas, px(0.5), py(0.66), len(0.46), EMERALD, 0.22);
  }

  // فلش صعودی (طلایی) — از چپ پایین به راست بالا
  const start = { x: px(0.235), y: py(0.335) };
  const end = { x: px(0.66), y: py(0.115) };
  const direction = { x: end.x - start.x, y: end.y - start.y };
  const length = Math.hypot(direction.x, direction.y);
  const unit = { x: direction.x / length, y: direction.y / length };
  const normal = { x: -unit.y, y: unit.x };

  const arrowColor = mono ? solid([255, 255, 255]) : (x, y) => {
    const t = Math.min(1, Math.max(0, (y - py(0.1)) / (py(0.38) - py(0.1))));
    const [r, g, b] = mix(GOLD_LIGHT, GOLD, t);
    return [r, g, b, 1];
  };

  fillSegment(canvas, start, end, len(0.075), arrowColor);

  const headLength = len(0.15);
  const headWidth = len(0.16);
  fillTriangle(
    canvas,
    { x: end.x + unit.x * headLength, y: end.y + unit.y * headLength },
    { x: end.x + normal.x * headWidth, y: end.y + normal.y * headWidth },
    { x: end.x - normal.x * headWidth, y: end.y - normal.y * headWidth },
    arrowColor,
  );

  // بدنه‌ی کیف‌پول
  const body = {
    x: px(0.14),
    y: py(0.42),
    w: len(0.72),
    h: len(0.4),
  };
  const bodyColor = mono
    ? solid([255, 255, 255])
    : (x, y) => {
        const t = Math.min(1, Math.max(0, (y - body.y) / body.h));
        const [r, g, b] = mix(EMERALD_LIGHT, EMERALD_DARK, t ** 0.9);
        return [r, g, b, 1];
      };
  fillRoundRect(canvas, body, len(0.09), bodyColor);

  // لبه‌ی بالایی (فلپ)
  const flap = {
    x: px(0.14),
    y: py(0.36),
    w: len(0.72),
    h: len(0.16),
  };
  const flapColor = mono
    ? solid([255, 255, 255])
    : (x, y) => {
        const t = Math.min(1, Math.max(0, (y - flap.y) / flap.h));
        const [r, g, b] = mix([0xa7, 0xf3, 0xd0], EMERALD, t);
        return [r, g, b, 1];
      };
  fillRoundRect(canvas, flap, len(0.07), flapColor);

  // گیره‌ی طلایی کیف‌پول
  const clasp = {
    x: px(0.6),
    y: py(0.565),
    w: len(0.24),
    h: len(0.13),
  };
  fillRoundRect(canvas, clasp, len(0.05), mono ? solid([255, 255, 255]) : solid(GOLD));

  const hole = {
    x: px(0.685),
    y: py(0.602),
    w: len(0.07),
    h: len(0.056),
  };
  punchRoundRect(canvas, hole, len(0.028));
}

// ---------- تبدیل به تصویر نهایی ----------

function downsample(canvas, size) {
  const { data, size: bigSize } = canvas;
  const output = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const samples = SS * SS;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const index = ((y * SS + sy) * bigSize + (x * SS + sx)) * 4;
          const alpha = data[index + 3];
          r += data[index] * alpha;
          g += data[index + 1] * alpha;
          b += data[index + 2] * alpha;
          a += alpha;
        }
      }

      const outIndex = (y * size + x) * 4;
      if (a > 0) {
        output[outIndex] = Math.round(Math.min(255, r / a));
        output[outIndex + 1] = Math.round(Math.min(255, g / a));
        output[outIndex + 2] = Math.round(Math.min(255, b / a));
        output[outIndex + 3] = Math.round((a / samples) * 255);
      }
    }
  }

  return output;
}

// ---------- کدگذار PNG ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ساخت خروجی‌ها ----------

function render({ size, background, mono = false, glyphScale = 0.8, glyphOffsetY = 0 }) {
  const canvas = createCanvas(size * SS);
  if (background) {
    drawBackground(canvas);
  }
  drawGlyph(canvas, {
    scale: glyphScale,
    offsetX: (1 - glyphScale) / 2,
    offsetY: (1 - glyphScale) / 2 + glyphOffsetY,
    mono,
    glow: background,
  });
  return encodePng(size, downsample(canvas, size));
}

function write(name, buffer) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, buffer);
  console.log(`${name}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

const icon = render({ size: 1024, background: true, glyphScale: 0.78, glyphOffsetY: 0.02 });
write('icon.png', icon);
write('splash-icon.png', icon);

write('android-icon-background.png', render({ size: 1024, background: true, glyphScale: 0.001 }));
write(
  'android-icon-foreground.png',
  render({ size: 1024, background: false, glyphScale: 0.58, glyphOffsetY: 0 }),
);
write(
  'android-icon-monochrome.png',
  render({ size: 1024, background: false, mono: true, glyphScale: 0.58, glyphOffsetY: 0 }),
);
