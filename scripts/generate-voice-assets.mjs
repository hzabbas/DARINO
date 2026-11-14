#!/usr/bin/env node
/**
 * ساخت کلیپ‌های صوتی آفلاین گوینده‌ی واریز.
 *
 * چرا این اسکریپت وجود دارد: گوینده‌ی آنلاین مایکروسافت ممکن است در لحظه‌ی
 * واریز در دسترس نباشد (اینترنت قطع، WebSocket مسدود، سرور ۴۰۳). برای همین
 * همه‌ی کلمه‌های لازم با همان صداهای عصبی فارسی از قبل ساخته و داخل اپ
 * بسته‌بندی می‌شوند؛ پخش آفلاین فقط این فایل‌ها را پشت‌سرهم می‌چسباند.
 *
 * پیش‌نیاز ساخت (فقط روی ماشین توسعه‌دهنده):
 *   python -m pip install edge-tts      (نیازمند اینترنت)
 *   ffmpeg.exe در PATH                   (برای حذف سکوت و یکسان‌سازی انکود)
 *
 * استفاده:
 *   node scripts/generate-voice-assets.mjs            # فقط فایل‌های نبوده را می‌سازد
 *   node scripts/generate-voice-assets.mjs --force    # همه را از نو می‌سازد
 *   node scripts/generate-voice-assets.mjs --gender female
 *   node scripts/generate-voice-assets.mjs --only 70  # فقط کلیپ‌هایی که «70» دارند
 *   node scripts/generate-voice-assets.mjs --check    # فقط بررسی وجود و سلامت (CI)
 *
 * خروجی: assets/voice/{female,male}/*.mp3
 * نام فایل‌ها باید **دقیقاً** با کلیدهای `VoiceClipStitcher.kt` یکی باشد.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'voice');

const GENDERS = [
  { key: 'female', voice: 'fa-IR-DilaraNeural' },
  { key: 'male', voice: 'fa-IR-FaridNeural' },
];

const RATE = '+5%';
const MIN_BYTES = 1000;
const CONCURRENCY = 4;
const ATTEMPTS = 3;

/** باید با آرایه‌های `DepositSpeech` و `PersianFinglish` یکی بماند. */
const NUMBER_WORDS = [
  ['1', 'یک'],
  ['2', 'دو'],
  ['3', 'سه'],
  ['4', 'چهار'],
  ['5', 'پنج'],
  ['6', 'شش'],
  ['7', 'هفت'],
  ['8', 'هشت'],
  ['9', 'نه'],
  ['10', 'ده'],
  ['11', 'یازده'],
  ['12', 'دوازده'],
  ['13', 'سیزده'],
  ['14', 'چهارده'],
  ['15', 'پونزده'],
  ['16', 'شونزده'],
  ['17', 'هیفده'],
  ['18', 'هیجده'],
  ['19', 'نوزده'],
  ['20', 'بیست'],
  ['30', 'سی'],
  ['40', 'چهل'],
  ['50', 'پنجاه'],
  ['60', 'شصت'],
  ['70', 'هفتاد'],
  ['80', 'هشتاد'],
  ['90', 'نود'],
  ['100', 'صد'],
  ['200', 'دویست'],
  ['300', 'سیصد'],
  ['400', 'چهارصد'],
  ['500', 'پونصد'],
  ['600', 'ششصد'],
  ['700', 'هفتصد'],
  ['800', 'هشتصد'],
  ['900', 'نهصد'],
];

const SCALE_WORDS = [
  ['hezar', 'هزار'],
  ['milyoon', 'میلیون'],
];

const EXTRA_CLIPS = [
  ['toman_variz_shod', 'تومن برات واریز شد'],
];

/** همه‌ی فایل‌های لازم برای هر جنس. */
export function buildClipSpec() {
  const clips = [];
  for (const [key, text] of NUMBER_WORDS) {
    clips.push({ name: key, text });
    clips.push({ name: `${key}_o`, text: `${text} و` });
  }
  for (const [key, text] of SCALE_WORDS) {
    clips.push({ name: key, text });
    clips.push({ name: `${key}_o`, text: `${text} و` });
  }
  for (const [name, text] of EXTRA_CLIPS) clips.push({ name, text });
  return clips;
}

const CLIPS = buildClipSpec();

const FILTER =
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,' +
  'areverse,' +
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,' +
  'areverse,' +
  'apad=pad_dur=0.04';

function parseArgs(argv) {
  const options = { check: false, force: false, gender: null, only: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--gender') options.gender = argv[++index] ?? null;
    else if (argument === '--only') options.only = argv[++index] ?? null;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else {
      console.error(`گزینه‌ی ناشناخته: ${argument}`);
      process.exit(2);
    }
  }
  return options;
}

function pythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function hasEdgeTts(python) {
  const probe = spawnSync(python, ['-m', 'edge_tts', '--version'], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

function hasFfmpeg() {
  return spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

function firstBytesAreMpeg(file) {
  const buffer = Buffer.alloc(3);
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.readSync(descriptor, buffer, 0, 3, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return buffer[0] === 0xff;
}

/** بررسی سلامت دارایی‌ها بدون نیاز به پایتون/ffmpeg؛ همین در CI اجرا می‌شود. */
function checkAssets() {
  const problems = [];
  let total = 0;
  let bytes = 0;

  for (const gender of GENDERS) {
    for (const clip of CLIPS) {
      const file = path.join(OUTPUT_DIR, gender.key, `${clip.name}.mp3`);
      total += 1;
      if (!fs.existsSync(file)) {
        problems.push(`missing ${path.relative(ROOT, file)}`);
        continue;
      }
      const size = fs.statSync(file).size;
      bytes += size;
      if (size < MIN_BYTES) {
        problems.push(`too small (${size} B) ${path.relative(ROOT, file)}`);
      } else if (!firstBytesAreMpeg(file)) {
        problems.push(`not raw mp3 ${path.relative(ROOT, file)}`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`voice assets: ${problems.length} problem(s)`);
    for (const problem of problems.slice(0, 30)) console.error(`  - ${problem}`);
    if (problems.length > 30) console.error(`  … ${problems.length - 30} more`);
    console.error('Run: node scripts/generate-voice-assets.mjs');
    return false;
  }

  console.log(
    `voice assets ok: ${total} files, ${(bytes / 1024 / 1024).toFixed(2)} MB total`,
  );
  return true;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, error: stderr.trim() }));
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function synthesize({ python, ffmpeg, gender, clip, workDir }) {
  const raw = path.join(workDir, `${gender.key}-${clip.name}.raw.mp3`);
  const finalFile = path.join(OUTPUT_DIR, gender.key, `${clip.name}.mp3`);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const synth = await run(python, [
      '-m',
      'edge_tts',
      '-v',
      gender.voice,
      '-t',
      clip.text,
      `--rate=${RATE}`,
      '--no-progress',
      '--write-media',
      raw,
    ]);

    if (synth.ok && fs.existsSync(raw) && fs.statSync(raw).size > MIN_BYTES) {
      fs.mkdirSync(path.dirname(finalFile), { recursive: true });

      if (ffmpeg) {
        const trim = await run(ffmpeg, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          raw,
          '-af',
          FILTER,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '48k',
          '-ar',
          '24000',
          '-ac',
          '1',
          '-write_xing',
          '0',
          '-id3v2_version',
          '0',
          finalFile,
        ]);
        if (!trim.ok) {
          // انکود مجدد شکست خورد؛ خروجی خام Edge هم پخش‌شدنی است.
          fs.copyFileSync(raw, finalFile);
        }
      } else {
        fs.copyFileSync(raw, finalFile);
      }

      try {
        fs.unlinkSync(raw);
      } catch {
        // نادیده
      }
      return true;
    }

    if (attempt < ATTEMPTS) await sleep(600 * attempt);
  }

  try {
    fs.unlinkSync(raw);
  } catch {
    // نادیده
  }
  return false;
}

async function generate(options) {
  const python = pythonCommand();
  if (!hasEdgeTts(python)) {
    console.error(
      `edge-tts پیدا نشد (${python}). نصب: ${python} -m pip install edge-tts`,
    );
    return false;
  }

  const ffmpeg = hasFfmpeg() ? process.env.FFMPEG || 'ffmpeg' : null;
  if (!ffmpeg) {
    console.warn('ffmpeg پیدا نشد؛ کلیپ‌ها بدون حذف سکوت ذخیره می‌شوند.');
  }

  const genders = GENDERS.filter((gender) => !options.gender || gender.key === options.gender);
  if (genders.length === 0) {
    console.error(`جنس نامعتبر: ${options.gender}`);
    return false;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darino-voice-'));
  const tasks = [];
  for (const gender of genders) {
    for (const clip of CLIPS) {
      if (options.only && !clip.name.includes(options.only)) continue;
      const target = path.join(OUTPUT_DIR, gender.key, `${clip.name}.mp3`);
      const exists = fs.existsSync(target) && fs.statSync(target).size >= MIN_BYTES;
      if (!exists || options.force) tasks.push({ gender, clip, target });
    }
  }

  if (tasks.length === 0) {
    console.log('همه‌ی کلیپ‌ها موجودند؛ چیزی برای ساخت نیست. (--force برای ساخت مجدد)');
    fs.rmSync(workDir, { recursive: true, force: true });
    return true;
  }

  console.log(`ساخت ${tasks.length} کلیپ صوتی…`);
  let done = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      const success = await synthesize({ python, ffmpeg, workDir, ...task });
      done += 1;
      if (!success) failed += 1;
      const status = success ? 'ok' : 'FAILED';
      console.log(`[${done}/${tasks.length}] ${task.gender.key}/${task.clip.name} ${status}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()));
  fs.rmSync(workDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`${failed} کلیپ ساخته نشد.`);
    return false;
  }

  return checkAssets();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log('node scripts/generate-voice-assets.mjs [--check] [--force] [--gender female|male] [--only NAME]');
    return;
  }

  const ok = options.check ? checkAssets() : await generate(options);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
