/**
 * Converts Toman amount to offline audio clip keys (TypeScript implementation).
 * Kept strictly in sync with plugins/android/sms/VoiceClipStitcher.kt for node:test.
 * Clips have connector variants (`_o`) when joined with the conjunction "o" (va).
 */

export const VOICE_ENDING_CLIP = 'toman_variz_shod';

const MAX_SUPPORTED_AMOUNT = 1_000_000_000;

const ONES = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const TEENS = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19'];

const TENS = ['', '', '20', '30', '40', '50', '60', '70', '80', '90'];

const HUNDREDS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

const SCALES = ['', 'hezar', 'milyoon'];

/** Decomposes a 3-digit group (1..999) into clip keys. */
export function decomposeThreeDigits(n: number, hasMoreAfter: boolean): string[] {
  const value = Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : 0), 0), 999);
  if (value === 0) return [];

  const keys: string[] = [];
  const hundreds = Math.floor(value / 100);
  const tensUnits = value % 100;

  if (hundreds > 0) {
    const key = HUNDREDS[hundreds];
    keys.push(tensUnits > 0 || hasMoreAfter ? `${key}_o` : key);
  }

  if (tensUnits >= 1 && tensUnits <= 19) {
    const key = tensUnits < 10 ? ONES[tensUnits] : TEENS[tensUnits - 10];
    keys.push(hasMoreAfter ? `${key}_o` : key);
  } else if (tensUnits >= 20) {
    const tens = Math.floor(tensUnits / 10) * 10;
    const units = tensUnits % 10;
    if (units > 0) {
      keys.push(`${TENS[tens / 10]}_o`);
      keys.push(hasMoreAfter ? `${ONES[units]}_o` : ONES[units]);
    } else {
      keys.push(hasMoreAfter ? `${TENS[tens / 10]}_o` : TENS[tens / 10]);
    }
  }

  return keys;
}

/** Non-zero three-digit groups from highest to lowest scale. */
function groupsOf(amount: number): [number, number][] | null {
  const groups: [number, number][] = [];
  let remaining = amount;
  let index = 0;

  while (remaining > 0) {
    const value = remaining % 1_000;
    if (value > 0) groups.push([index, value]);
    remaining = Math.floor(remaining / 1_000);
    index += 1;
    if (index > SCALES.length) return null;
  }

  return groups.reverse();
}

/**
 * Returns clip keys for this amount, terminating with `toman_variz_shod`.
 * Returns null for zero, invalid, or >= 1 billion amounts.
 */
export function clipsFor(amountToman: number): string[] | null {
  if (!Number.isFinite(amountToman)) return null;
  const amount = Math.trunc(Math.abs(amountToman));
  if (amount <= 0 || amount >= MAX_SUPPORTED_AMOUNT) return null;

  const clips: string[] = [];

  if (amount === 1_000) {
    clips.push('hezar');
  } else if (amount >= 1_000 && amount < 1_000_000 && amount % 1_000 === 0) {
    clips.push(...decomposeThreeDigits(amount / 1_000, false));
  } else {
    const groups = groupsOf(amount);
    if (!groups || groups.length === 0) return null;

    for (let position = 0; position < groups.length; position += 1) {
      const [index, value] = groups[position];
      const hasLaterGroup = position < groups.length - 1;

      // Standalone "hezar" without "yek" prefix
      if (!(index === 1 && value === 1)) {
        clips.push(...decomposeThreeDigits(value, false));
      }

      if (index > 0) {
        const scale = SCALES[index];
        if (!scale) return null;
        clips.push(hasLaterGroup ? `${scale}_o` : scale);
      }
    }
  }

  if (clips.length === 0) return null;
  clips.push(VOICE_ENDING_CLIP);
  return clips;
}
