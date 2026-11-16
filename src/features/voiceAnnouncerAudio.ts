import {
  getVoiceGuardStatus,
  isIgnoringBatteryOptimizations,
  isSmsReaderAvailable,
  openAutoStartSettings,
  requestIgnoreBatteryOptimizations,
  restartVoiceGuard,
  syncVoiceConfig,
  testVoiceAnnouncement,
  type VoiceAnnouncementTestResult,
  type VoiceGuardStatus,
} from '../native/smsReader';
import type { SqlDatabase } from '../types/models';
import {
  buildVoiceAnnouncementTestOptions,
  buildVoiceConfigJson,
  type VoiceAnnouncerSettings,
  type VoiceAnnouncerService,
} from './voiceAnnouncer';

/**
 * Native audio playback and settings synchronization for deposit voice announcer.
 * Pure audio clip composition lives in `voiceClipStitcher.ts` for node:test compatibility.
 */
export { clipsFor, decomposeThreeDigits, VOICE_ENDING_CLIP } from './voiceClipStitcher';

/** Syncs voice config to native SharedPreferences. */
export async function pushVoiceConfig(json: string): Promise<boolean> {
  if (!isSmsReaderAvailable) return false;
  return syncVoiceConfig(json);
}

export async function syncVoiceConfigToNative(db: SqlDatabase): Promise<boolean> {
  return pushVoiceConfig(buildVoiceConfigJson(db));
}

/**
 * Plays a live test announcement using selected service, template, pitch and rate.
 */
export async function playVoiceAnnouncerTest(
  settings: VoiceAnnouncerSettings,
  amountToman?: number,
  service: VoiceAnnouncerService = settings.service,
): Promise<VoiceAnnouncementTestResult> {
  if (!isSmsReaderAvailable) {
    return { ok: false, engine: service, message: 'اعلام صوتی فقط در نسخه‌ی اندروید در دسترس است.' };
  }
  return testVoiceAnnouncement(buildVoiceAnnouncementTestOptions(settings, amountToman, service));
}
export type { VoiceAnnouncementTestResult };

/** Checks battery optimization exemption status. */
export { isIgnoringBatteryOptimizations };

/** Request prompt to disable battery optimization. */
export { requestIgnoreBatteryOptimizations };

/** Persistent background guard service status. */
export { getVoiceGuardStatus };
export type { VoiceGuardStatus };

/** Restarts background guard service. */
export { restartVoiceGuard };

/** Opens vendor-specific autostart settings. */
export { openAutoStartSettings };
