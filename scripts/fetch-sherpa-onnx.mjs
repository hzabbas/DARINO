#!/usr/bin/env node
/**
 * Downloads and prepares sherpa-onnx AAR and Persian Piper model for offline local neural TTS.
 * Usage:
 *   node scripts/fetch-sherpa-onnx.mjs
 *   node scripts/fetch-sherpa-onnx.mjs --force
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'sherpa-onnx');
const MODEL_DIR = path.join(VENDOR_DIR, 'fa_IR');

// sherpa-onnx v1.13.8 supports Piper fa_IR with espeak-ng data_dir.
const AAR_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar';
const MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fa_IR-amir-medium-int8.tar.bz2';

const AAR_MIN_BYTES = 30 * 1024 * 1024;
const MODEL_MIN_BYTES = 15 * 1024 * 1024;

/** Essential espeak-ng root files needed for Persian/English synthesis. */
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
      log(`Downloading (attempt ${attempt}): ${url}`);
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
      if (size <= 0) throw new Error('Downloaded empty file');

      fs.rmSync(target, { force: true });
      fs.renameSync(tmp, target);
      return size;
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      if (attempt === 4) {
        fail(`Download failed: ${error.message}`);
      }
      const wait = attempt * 2_000;
      log(`Error: ${error.message}; retrying in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/** Extracts bz2 archive using system tar. */
function extractArchive(archive, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync('tar', ['-xjf', archive, '-C', outDir], {
    stdio: 'inherit',
  });

  if (result.error) {
    fail(`tar execution failed (${result.error.message}). Requires tar in PATH.`);
  }
  if (result.status !== 0) {
    fail(`Archive extraction failed with exit code ${result.status}`);
  }
}

/** Locate directory containing .onnx model file. */
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

/** Copies necessary espeak-ng-data files only. */
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
      fail(`Required espeak-ng-data file missing: ${name}`);
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

  // 1) Engine AAR
  const aarPath = path.join(VENDOR_DIR, 'sherpa-onnx.aar');
  if (!force && aarReady()) {
    log('Engine AAR already exists; skipping');
  } else {
    const size = await download(AAR_URL, aarPath);
    if (size < AAR_MIN_BYTES) fail(`AAR incomplete (${Math.round(size / 1024 / 1024)} MB)`);
    log(`AAR ready (${Math.round(size / 1024 / 1024)} MB)`);
  }

  // 2) Persian Piper model
  if (!force && modelReady()) {
    log('Piper model already exists; skipping');
  } else {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darino-sherpa-'));
    try {
      const archive = path.join(workDir, 'model.tar.bz2');
      const size = await download(MODEL_URL, archive);
      if (size < MODEL_MIN_BYTES) {
        fail(`Model archive incomplete (${Math.round(size / 1024 / 1024)} MB)`);
      }

      const extractDir = path.join(workDir, 'extracted');
      extractArchive(archive, extractDir);

      const root = findModelRoot(extractDir);
      if (!root) fail('.onnx file not found in model archive');

      fs.rmSync(MODEL_DIR, { recursive: true, force: true });
      fs.mkdirSync(MODEL_DIR, { recursive: true });

      // Copy root model files: onnx, tokens, json, model card
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!/\.(onnx|json|txt)$/i.test(entry.name) && entry.name !== 'MODEL_CARD') continue;
        fs.copyFileSync(path.join(root, entry.name), path.join(MODEL_DIR, entry.name));
      }

      const espeakSource = path.join(root, 'espeak-ng-data');
      if (!fs.existsSync(espeakSource)) fail('espeak-ng-data folder not found in model');
      pruneEspeakData(espeakSource, path.join(MODEL_DIR, 'espeak-ng-data'));

      log('Piper model and espeak-ng-data ready');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  const modelBytes = fs
    .readdirSync(MODEL_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + fileSize(path.join(entry.parentPath ?? entry.path, entry.name)), 0);

  console.log('');
  console.log(`✓ Ready: ${path.relative(ROOT, VENDOR_DIR)}`);
  console.log(`  AAR:   ${Math.round(fileSize(aarPath) / 1024 / 1024)} MB`);
  console.log(`  Model: ${Math.round(modelBytes / 1024 / 1024)} MB`);
}

main().catch((error) => {
  fail(error?.message ?? String(error));
});
