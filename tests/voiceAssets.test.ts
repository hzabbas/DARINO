import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * کلیپ‌های صوتی آفلاین گوینده‌ی واریز.
 *
 * این فایل‌ها ضمیمه‌ی اپ می‌شوند و `VoiceClipStitcher.kt` آن‌ها را با همین
 * نام‌ها باز می‌کند؛ یک فایل گم‌شده یعنی سکوت در حالت آفلاین، پس تست باید
 * دقیقاً همان مجموعه را بخواهد.
 */

const ROOT = process.cwd();
const VOICE_DIR = path.join(ROOT, 'assets', 'voice');
const GENDERS = ['female', 'male'] as const;
const MIN_BYTES = 1000;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const NUMBER_KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '20', '30', '40', '50', '60', '70', '80', '90',
  '100', '200', '300', '400', '500', '600', '700', '800', '900',
];

const SCALE_KEYS = ['hezar', 'milyoon'];

const EXTRA_KEYS = ['toman_variz_shod'];

function expectedNames(): string[] {
  const names: string[] = [];
  for (const key of NUMBER_KEYS) {
    names.push(key, `${key}_o`);
  }
  for (const key of SCALE_KEYS) {
    names.push(key, `${key}_o`);
  }
  names.push(...EXTRA_KEYS);
  return names.sort();
}

test('every offline voice clip is bundled for both genders', () => {
  const expected = expectedNames();
  let totalBytes = 0;

  for (const gender of GENDERS) {
    const directory = path.join(VOICE_DIR, gender);
    assert.ok(fs.existsSync(directory), `missing directory ${gender}`);

    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.mp3'));
    assert.deepEqual(
      files.map((file) => file.replace(/\.mp3$/, '')).sort(),
      expected,
      `${gender} clip set`,
    );

    for (const name of expected) {
      const file = path.join(directory, `${name}.mp3`);
      const size = fs.statSync(file).size;
      totalBytes += size;

      assert.ok(size >= MIN_BYTES, `${gender}/${name}.mp3 is only ${size} bytes`);

      // پخش آفلاین فایل‌ها را بایت‌به‌بایت می‌چسباند؛ اگر فایلی با تگ ID3 شروع
      // شود، همان تگ وسط جریان MP3 می‌افتد و پخش‌کن آن را نمی‌فهمد.
      const header = Buffer.alloc(3);
      const descriptor = fs.openSync(file, 'r');
      try {
        fs.readSync(descriptor, header, 0, 3, 0);
      } finally {
        fs.closeSync(descriptor);
      }
      assert.equal(header[0], 0xff, `${gender}/${name}.mp3 does not start with an MPEG frame`);
    }
  }

  assert.ok(
    totalBytes <= MAX_TOTAL_BYTES,
    `voice assets are ${(totalBytes / 1024 / 1024).toFixed(2)} MB, over the 5 MB budget`,
  );
});

test('connector clips exist for every word that can precede «و»', () => {
  for (const gender of GENDERS) {
    for (const key of [...NUMBER_KEYS, ...SCALE_KEYS]) {
      const file = path.join(VOICE_DIR, gender, `${key}_o.mp3`);
      assert.ok(fs.existsSync(file), `${gender}/${key}_o.mp3`);
    }
  }
});
