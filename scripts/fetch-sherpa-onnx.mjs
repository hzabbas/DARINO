#!/usr/bin/env node
/**
 * دانلود و آماده‌سازی موتور صدای عصبی فارسی روی گوشی.
 *
 * چرا این اسکریپت وجود دارد: موتور sherpa-onnx و مدل Piper حجم زیادی دارند
 * (AAR ~۴۸ مگابایت و مدل ~۲۰ مگابایت) و در git نگه‌داری نمی‌شوند؛ ولی بیلد
 * release برای کارکرد آفلاین به آن‌ها نیاز دارد. این اسکریپت قطعات را در
 * `vendor/sherpa-onnx/` می‌گذارد و پلاگین `withSherpaTts` در prebuild آن‌ها را
 * داخل APK کپی می‌کند.
 *
 * استفاده:
 *   node scripts/fetch-sherpa-onnx.mjs           # اگر نبود دانلود می‌کند
 *   node scripts/fetch-sherpa-onnx.mjs --force   # همه را از نو دانلود می‌کند
 *
 * پیش‌نیاز: `tar` در PATH (روی لینوکس، مک و ویندوز ۱۰+ موجود است) برای باز
 * کردن آرشیو bz2 مدل.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'sherpa-onnx');
const MODEL_DIR = path.join(VENDOR_DIR, 'fa_IR');

/** sherpa-onnx v1.13.8 تنها شاخه‌ای است که Piper فارسی به espeak-ng نیاز دارد
 *  و `data_dir` را هنوز پشتیبانی می‌کند؛ v2.0.0 به بعد espeak-ng را حذف کرده
 *  و مدل‌های Piper فارسی را بی‌صدا می‌کند. */
const AAR_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar';
const MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fa_IR-amir-medium-int8.tar.bz2';

const AAR_MIN_BYTES = 30 * 1024 * 1024;
const MODEL_MIN_BYTES = 15 * 1024 * 1024;

/**
 * فایل‌های ریشه‌ی espeak-ng که espeak در زمان راه‌اندازی و برای فارسی/انگلیسی
 * لازم دارد. بقیه‌ی دیکشنری‌ها (مانند `ru_dict` با ۸ مگابایت) هرگز برای این
 * مدل بارگذاری نمی‌شوند و فقط حجم APK را زیاد می‌کنند.
 */
const ESPEAK_ROOT_FILES = [
  'phondata',
  'phontab',
  'phonindex',
  'phondata-manifest',
  'intonations',
  'fa_dict',
  'en_dict',
];
const ESPEAK_DIRS = ['lang', 'voices'];

const force = process.argv.includes('--force');

function log(message) {
  console.log(`• ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

async function download(url, target) {
  const tmp = `${target}.part`;
  fs.mkdirSync(path.dirname(target), { recursive: true });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      log(`دانلود (تلاش ${attempt}): ${url}`);
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const handle = await fs.promises.open(tmp, 'w');
      try {
        for await (const chunk of response.body) {
          await handle.write(chunk);
        }
      } finally {
        await handle.close();
      }

      const size = fileSize(tmp);
      if (size <= 0) throw new Error('فایل خالی دانلود شد');

      fs.rmSync(target, { force: true });
      fs.renameSync(tmp, target);
      return size;
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      if (attempt === 4) {
        fail(`دانلود نشد: ${error.message}`);
      }
      const wait = attempt * 2_000;
      log(`خطا: ${error.message}؛ ${wait / 1000} ثانیه بعد دوباره تلاش می‌کنم`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/** استخراج آرشیو bz2 مدل با `tar` سیستم. */
function extractArchive(archive, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync('tar', ['-xjf', archive, '-C', outDir], {
    stdio: 'inherit',
  });

  if (result.error) {
    fail(
      `اجرای tar ناموفق بود (${result.error.message}). ` +
        'روی ویندوز ۱۰+ و لینوکس/مک باید از قبل نصب باشد.',
    );
  }
  if (result.status !== 0) {
    fail(`باز کردن آرشیو مدل با کد ${result.status} شکست خورد`);
  }
}

/** پوشه‌ای که فایل `.onnx` دارد. */
function findModelRoot(baseDir) {
  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.onnx'))) {
      return current;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  return null;
}

/** کپی فقط قطعات لازم espeak-ng-data به مقصد. */
function pruneEspeakData(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  for (const name of ESPEAK_ROOT_FILES) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(target, name));
    }
  }

  for (const name of ESPEAK_DIRS) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) {
      fs.cpSync(from, path.join(target, name), { recursive: true });
    }
  }

  const required = ['phondata', 'phontab', 'phonindex', 'fa_dict'];
  for (const name of required) {
    if (!fs.existsSync(path.join(target, name))) {
      fail(`فایل ضروری espeak-ng-data پیدا نشد: ${name}`);
    }
  }
}

function aarReady() {
  return fileSize(path.join(VENDOR_DIR, 'sherpa-onnx.aar')) >= AAR_MIN_BYTES;
}

function modelReady() {
  if (!fs.existsSync(MODEL_DIR)) return false;
  const entries = fs.readdirSync(MODEL_DIR);
  const hasModel = entries.some((entry) => entry.endsWith('.onnx') && fileSize(path.join(MODEL_DIR, entry)) > 1_000_000);
  return (
    hasModel &&
    entries.includes('tokens.txt') &&
    fs.existsSync(path.join(MODEL_DIR, 'espeak-ng-data', 'phondata'))
  );
}

async function main() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  // ۱) AAR موتور
  const aarPath = path.join(VENDOR_DIR, 'sherpa-onnx.aar');
  if (!force && aarReady()) {
    log('AAR موتور از قبل موجود است؛ رد شد');
  } else {
    const size = await download(AAR_URL, aarPath);
    if (size < AAR_MIN_BYTES) fail(`AAR ناقص است (${Math.round(size / 1024 / 1024)} MB)`);
    log(`AAR آماده شد (${Math.round(size / 1024 / 1024)} MB)`);
  }

  // ۲) مدل Piper فارسی
  if (!force && modelReady()) {
    log('مدل Piper از قبل موجود است؛ رد شد');
  } else {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darino-sherpa-'));
    try {
      const archive = path.join(workDir, 'model.tar.bz2');
      const size = await download(MODEL_URL, archive);
      if (size < MODEL_MIN_BYTES) {
        fail(`آرشیو مدل ناقص است (${Math.round(size / 1024 / 1024)} MB)`);
      }

      const extractDir = path.join(workDir, 'extracted');
      extractArchive(archive, extractDir);

      const root = findModelRoot(extractDir);
      if (!root) fail('فایل .onnx در آرشیو مدل پیدا نشد');

      fs.rmSync(MODEL_DIR, { recursive: true, force: true });
      fs.mkdirSync(MODEL_DIR, { recursive: true });

      // فایل‌های ریشه‌ی مدل: onnx، tokens، json و کارت مدل
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!/\.(onnx|json|txt)$/i.test(entry.name) && entry.name !== 'MODEL_CARD') continue;
        fs.copyFileSync(path.join(root, entry.name), path.join(MODEL_DIR, entry.name));
      }

      const espeakSource = path.join(root, 'espeak-ng-data');
      if (!fs.existsSync(espeakSource)) fail('پوشه‌ی espeak-ng-data در مدل پیدا نشد');
      pruneEspeakData(espeakSource, path.join(MODEL_DIR, 'espeak-ng-data'));

      log('مدل Piper و espeak-ng-data آماده شدند');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  const modelBytes = fs
    .readdirSync(MODEL_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + fileSize(path.join(entry.parentPath ?? entry.path, entry.name)), 0);

  console.log('');
  console.log(`✓ آماده است: ${path.relative(ROOT, VENDOR_DIR)}`);
  console.log(`  AAR:  ${Math.round(fileSize(aarPath) / 1024 / 1024)} MB`);
  console.log(`  مدل:  ${Math.round(modelBytes / 1024 / 1024)} MB`);
  console.log('  حالا `npx expo prebuild -p android` موتور را داخل APK می‌گذارد.');
}

main().catch((error) => {
  fail(error?.message ?? String(error));
});
