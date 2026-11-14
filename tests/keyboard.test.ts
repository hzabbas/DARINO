import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_SHEET_HEIGHT,
  RESIZE_THRESHOLD,
  SHEET_TOP_GAP,
  computeSheetKeyboardMetrics,
  contentKeyboardPadding,
  isWindowResized,
} from '../src/utils/keyboard';

const WINDOW_HEIGHT = 800;
const KEYBOARD_HEIGHT = 300;
const TOP_INSET = 44;

test('a closed keyboard adds no lift and leaves the sheet nearly full screen', () => {
  const metrics = computeSheetKeyboardMetrics({
    containerHeight: WINDOW_HEIGHT,
    baselineHeight: WINDOW_HEIGHT,
    keyboardHeight: 0,
    isKeyboardVisible: false,
    topInset: TOP_INSET,
    platform: 'android',
  });

  assert.equal(metrics.lift, 0);
  assert.equal(metrics.isKeyboardVisible, false);
  assert.equal(metrics.keyboardHeight, 0);
  assert.equal(metrics.maxHeight, WINDOW_HEIGHT - TOP_INSET - SHEET_TOP_GAP);
});

test('inside a modal on android the sheet is lifted by the keyboard height', () => {
  const metrics = computeSheetKeyboardMetrics({
    containerHeight: WINDOW_HEIGHT,
    baselineHeight: WINDOW_HEIGHT,
    keyboardHeight: KEYBOARD_HEIGHT,
    isKeyboardVisible: true,
    topInset: TOP_INSET,
    platform: 'android',
  });

  assert.equal(metrics.lift, KEYBOARD_HEIGHT, 'شیت باید به اندازه‌ی کیبورد بالا بیاید');
  assert.equal(metrics.isKeyboardVisible, true);
  assert.equal(metrics.resized, false);
  assert.equal(
    metrics.maxHeight,
    WINDOW_HEIGHT - KEYBOARD_HEIGHT - TOP_INSET - SHEET_TOP_GAP,
    'ارتفاع مجاز شیت باید به اندازه‌ی کیبورد کم شود تا سربرگ بیرون نزند',
  );
});

test('a window that already resized is never padded twice', () => {
  const resizedHeight = WINDOW_HEIGHT - KEYBOARD_HEIGHT;

  const metrics = computeSheetKeyboardMetrics({
    containerHeight: resizedHeight,
    baselineHeight: WINDOW_HEIGHT,
    keyboardHeight: KEYBOARD_HEIGHT,
    isKeyboardVisible: true,
    topInset: TOP_INSET,
    platform: 'android',
  });

  assert.equal(metrics.resized, true);
  assert.equal(metrics.lift, 0, 'چون پنجره خودش کوچک شده، فاصله‌ی اضافه لازم نیست');
  assert.equal(metrics.maxHeight, resizedHeight - TOP_INSET - SHEET_TOP_GAP);
});

test('ios always lifts by the keyboard height', () => {
  const metrics = computeSheetKeyboardMetrics({
    containerHeight: WINDOW_HEIGHT,
    baselineHeight: WINDOW_HEIGHT,
    keyboardHeight: KEYBOARD_HEIGHT,
    isKeyboardVisible: true,
    topInset: TOP_INSET,
    platform: 'ios',
  });

  assert.equal(metrics.lift, KEYBOARD_HEIGHT);
});

test('the sheet never collapses below the minimum usable height', () => {
  const metrics = computeSheetKeyboardMetrics({
    containerHeight: 320,
    baselineHeight: 320,
    keyboardHeight: 300,
    isKeyboardVisible: true,
    topInset: TOP_INSET,
    platform: 'android',
  });

  assert.equal(metrics.maxHeight, MIN_SHEET_HEIGHT);
});

test('web has no keyboard geometry at all', () => {
  const metrics = computeSheetKeyboardMetrics({
    containerHeight: WINDOW_HEIGHT,
    baselineHeight: WINDOW_HEIGHT,
    keyboardHeight: KEYBOARD_HEIGHT,
    isKeyboardVisible: true,
    topInset: TOP_INSET,
    platform: 'web',
  });

  assert.equal(metrics.isKeyboardVisible, false);
  assert.equal(metrics.lift, 0);
});

test('window resize detection needs a real height change', () => {
  assert.equal(isWindowResized(0, WINDOW_HEIGHT), false);
  assert.equal(isWindowResized(WINDOW_HEIGHT, 0), false);
  assert.equal(isWindowResized(WINDOW_HEIGHT - 10, WINDOW_HEIGHT), false);
  assert.equal(isWindowResized(WINDOW_HEIGHT - RESIZE_THRESHOLD, WINDOW_HEIGHT), true);
  assert.equal(isWindowResized(WINDOW_HEIGHT - KEYBOARD_HEIGHT, WINDOW_HEIGHT), true);
});

test('screen content padding follows the platform and the modal state', () => {
  const base = {
    keyboardHeight: KEYBOARD_HEIGHT,
    isKeyboardVisible: true,
  };

  assert.equal(contentKeyboardPadding({ ...base, platform: 'ios' }), KEYBOARD_HEIGHT);
  assert.equal(
    contentKeyboardPadding({ ...base, platform: 'android' }),
    0,
    'با adjustResize بیرون از مودال نباید دوباره جا باز شود',
  );
  assert.equal(
    contentKeyboardPadding({ ...base, platform: 'android', inModal: true }),
    KEYBOARD_HEIGHT,
    'دیالوگ بومی resize نمی‌شود و خودمان باید جا باز کنیم',
  );
  assert.equal(contentKeyboardPadding({ ...base, platform: 'web' }), 0);
  assert.equal(
    contentKeyboardPadding({
      ...base,
      platform: 'ios',
      isKeyboardVisible: false,
      keyboardHeight: 0,
    }),
    0,
  );
});
