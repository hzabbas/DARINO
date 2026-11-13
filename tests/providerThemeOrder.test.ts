import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/**
 * این تست از روی متن فایل‌هاست، نه اجرای RN: می‌خواهیم همان باگی که روی گوشی رخ
 * داد (AppText → useTheme خارج از ThemeProvider) دوباره از راه برنگردد.
 */
const ROOT = resolve(process.cwd(), 'src');

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

const THEME_FREE_LAYERS = [
  // این‌ها بالاتر از ThemeProvider رندر می‌شوند (ThemeProvider خودش useDatabase دارد).
  { name: 'DatabaseProvider', path: 'db/DatabaseProvider.tsx' },
  { name: 'AppErrorBoundary', path: 'components/AppErrorBoundary.tsx' },
];

for (const layer of THEME_FREE_LAYERS) {
  test(`${layer.name} does not depend on the theme context`, () => {
    const source = read(layer.path);
    assert.ok(
      !source.includes("import { AppText } from '../components/AppText'") &&
        !source.includes("from './AppText'") &&
        !source.includes("from '../AppText'"),
      'این لایه نباید AppText بگیرد؛ AppText خودش useTheme را صدا می‌زند',
    );
    assert.ok(!/useTheme\s*\(/.test(source), 'useTheme بیرون از ThemeProvider خطا می‌دهد');
    assert.ok(!/useThemedStyles\s*\(/.test(source), 'useThemedStyles هم وابسته به تم است');
  });
}

test('the root layout keeps theme consumption inside DatabaseProvider', () => {
  const layout = read('app/_layout.tsx');
  const errorBoundaryAt = layout.indexOf('<AppErrorBoundary>');
  const databaseAt = layout.indexOf('<DatabaseProvider>');
  const themeAt = layout.indexOf('<ThemeProvider>');

  assert.ok(errorBoundaryAt !== -1, 'تور خطای کلی باید باقی بماند');
  assert.ok(databaseAt > errorBoundaryAt, 'دیتابیس زیر تور خطا است');
  assert.ok(themeAt > databaseAt, 'تم فقط بعد از آماده‌شدن دیتابیس mount می‌شود');
});

test('AppText still depends on useTheme (documenting why startup shells must avoid it)', () => {
  const appText = read('components/AppText.tsx');
  assert.ok(/import\s*\{[^}]*useTheme/.test(appText));
  assert.ok(/useTheme\(\)/.test(appText));
});
