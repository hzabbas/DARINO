#!/usr/bin/env node
/**
 * انتشار خودکار نسخه:
 *   npm run release            → نسخه‌ی patch را یک عدد بالا می‌برد (1.0.0 → 1.0.1)
 *   npm run release -- minor   → 1.0.0 → 1.1.0
 *   npm run release -- major   → 1.0.0 → 2.0.0
 *   npm run release -- --current → نسخه‌ی فعلی را تگ می‌زند (بدون تغییر شماره)
 *
 * نسخه در package.json و app.json یکسان می‌شود، versionCode اندروید بالا می‌رود،
 * تغییرات کامیت می‌شوند، تگ vX.Y.Z ساخته می‌شود و همه‌چیز push می‌شود؛
 * push تگ، ورک‌فلوی GitHub Actions را برای ساخت APK و Release اجرا می‌کند.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const keepVersion = args.includes('--current');
const bumpType = args.find((arg) => ['major', 'minor', 'patch'].includes(arg)) ?? 'patch';

function run(command) {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

function read(command) {
  return execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
}

function bump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const pkg = readJson('package.json');
const app = readJson('app.json');

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  console.error(`✗ نسخه‌ی نامعتبر در package.json: ${pkg.version}`);
  process.exit(1);
}
if (pkg.version !== app.expo.version) {
  console.warn(`⚠ نسخه‌ها هم‌خوان نیستند (${pkg.version} / ${app.expo.version})؛ از package.json استفاده می‌شود.`);
}

const version = keepVersion ? pkg.version : bump(pkg.version, bumpType);
const tag = `v${version}`;

try {
  read(`git rev-parse --verify --quiet refs/tags/${tag}`);
  console.error(`✗ تگ ${tag} از قبل وجود دارد؛ اول شماره‌ی نسخه را بالا ببر.`);
  process.exit(1);
} catch {
  // تگ وجود ندارد؛ ادامه می‌دهیم
}

if (!keepVersion) {
  pkg.version = version;
  app.expo.version = version;
  app.expo.android = {
    ...app.expo.android,
    versionCode: Number(app.expo.android?.versionCode ?? 0) + 1,
  };
  writeJson('package.json', pkg);
  writeJson('app.json', app);
  console.log(`• نسخه به ${version} تغییر کرد (versionCode: ${app.expo.android.versionCode})`);
}

if (read('git status --porcelain')) {
  run('git add -A');
  run(`git commit -m "release ${tag}"`);
  console.log('• تغییرات کامیت شدند');
} else {
  console.log('• تغییری برای کامیت نبود؛ تگ روی کامیت فعلی زده می‌شود');
}

run(`git tag -a ${tag} -m "Darino ${tag}"`);
run('git push origin HEAD --tags');

console.log('');
console.log(`✓ ${tag} ساخته و push شد.`);
console.log('  GitHub Actions حالا APK را می‌سازد و Release را منتشر می‌کند.');
