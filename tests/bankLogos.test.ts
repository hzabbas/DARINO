import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { IRANIAN_BANKS } from '../src/utils/iranianBanks';

/**
 * این تست عمداً ماژول‌های .tsx را import نمی‌کند (react-native-svg زیر node قابل
 * بارگذاری نیست) و به‌جایش سورس را به‌صورت متن می‌خواند — مثل تست‌های دیگر
 * پروژه که با `tsx --test` از ریشه‌ی ریپو اجرا می‌شوند.
 */
const repoRoot = process.cwd();
const svgPath = path.join(repoRoot, 'src', 'components', 'bankLogosSvg.tsx');
const bankLogoPath = path.join(repoRoot, 'src', 'components', 'BankLogo.tsx');

const svgSource = readFileSync(svgPath, 'utf8');
const bankLogoSource = readFileSync(bankLogoPath, 'utf8');

const mapStart = svgSource.indexOf('export const BANK_LOGOS');
assert.ok(mapStart >= 0, 'BANK_LOGOS باید در bankLogosSvg صادر شود');

const mapEntries = [...svgSource.slice(mapStart).matchAll(/^\s{2}(\w+):\s*(\w+),/gm)].map((match) => ({
  code: match[1],
  component: match[2],
}));
const emblemCodes = new Set(mapEntries.map((entry) => entry.code));

test('every bank except "other" has a vector emblem', () => {
  const expected = IRANIAN_BANKS.filter((bank) => bank.code !== 'other').map((bank) => bank.code);

  for (const code of expected) {
    assert.ok(emblemCodes.has(code), `نشان برداری برای «${code}» ثبت نشده است`);
  }

  assert.equal(emblemCodes.size, expected.length, 'تعداد نشان‌ها با تعداد بانک‌ها نمی‌خواند');
  assert.ok(!emblemCodes.has('other'), 'بانک «other» نباید نشان برداری بگیرد و باید قاب حرف‌دار بماند');
});

test('every emblem in the map points to a defined component', () => {
  for (const { code, component } of mapEntries) {
    assert.ok(
      new RegExp(`const ${component}\\b`).test(svgSource),
      `کامپوننت ${component} (برای «${code}») در فایل تعریف نشده است`,
    );
  }
});

test('the vector module stays small enough for the bundle', () => {
  const bytes = statSync(svgPath).size;
  assert.ok(bytes < 15 * 1024, `bankLogosSvg.tsx باید کمتر از 15KB باشد؛ الان ${bytes} بایت است`);
});

test('the vector module uses no raster or external assets', () => {
  for (const forbidden of ['base64', 'require(', '<Image', '.png', '.jpg']) {
    assert.ok(!svgSource.includes(forbidden), `bankLogosSvg نباید «${forbidden}» داشته باشد`);
  }

  assert.ok(svgSource.includes("from 'react-native-svg'"), 'نشان‌ها باید فقط از primitivesهای react-native-svg ساخته شوند');
});

test('BankLogo prefers the emblem and keeps the badge fallback', () => {
  assert.ok(bankLogoSource.includes('BANK_LOGOS'), 'BankLogo باید BANK_LOGOS را import کند');
  assert.match(bankLogoSource, /BANK_LOGOS\[code\]/, 'BankLogo باید با code نشان را از BANK_LOGOS بردارد');
  assert.ok(bankLogoSource.includes('bank.badge'), 'برای بانک ناشناس باید قاب حرف‌دار (bank.badge) بماند');
  assert.ok(bankLogoSource.includes("from './bankLogosSvg'"), 'مسیر import نشان‌ها باید درست باشد');
});
