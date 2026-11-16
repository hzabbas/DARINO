import { NativeModules, Platform } from 'react-native';

export interface SmsSenderInfo {
  sender: string;
  lastBody: string;
  lastDate: number;
  count: number;
}

export interface RawSms {
  id: string;
  sender: string;
  body: string;
  date: number;
  /** SMS fingerprint (`sender|timestamp`) carried by notification */
  fingerprint?: string;
}

export interface SmsNotificationAction {
  /** Opened via bank SMS notification tap */
  open: boolean;
  /** Fingerprint of the target notification */
  smsFingerprint: string | null;
  /** Deep link URI (`darino://pending-sms?...`) */
  url: string | null;
}

export interface SmsQueueSnapshot {
  messages: RawSms[];
  /** Highest processed sequence number */
  maxSeq: number;
}

/** Parameters passed directly to the native test announcement */
export interface VoiceAnnouncementTestOptions {
  template: string;
  engine: 'local' | 'neural' | 'clips' | 'system';
  gender: 'female' | 'male';
  chimeEnabled: boolean;
  rate: number;
  amountToman: number;
}

/** Strict test playback result from native engine */
export interface VoiceAnnouncementTestResult {
  ok: boolean;
  engine: string;
  message: string | null;
}

/** Sherpa-ONNX model info and diagnostic state */
export interface SherpaModelInfo {
  bundled: boolean;
  ready: boolean;
  modelName: string;
  modelBytes: number;
  numSpeakers: number;
}

export interface VoiceGuardStatus {
  enabled: boolean;
  running: boolean;
  /** Timestamp of last heartbeat in ms */
  lastSeen: number;
}

interface SmsReaderNative {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  getRecentSmsSenders(): Promise<SmsSenderInfo[]>;
  getSmsMessagesSince(timestamp: number, senders: string[]): Promise<RawSms[]>;
  setBankSenders(senders: string[]): void;
  readQueue(): Promise<string>;
  clearQueue(maxSeq: number): Promise<boolean>;
  getInitialNotificationAction(): Promise<SmsNotificationAction | null>;
  syncVoiceConfig(configJson: string): Promise<boolean>;
  testVoiceAnnouncement(
    engine: VoiceAnnouncementTestOptions['engine'],
    gender: VoiceAnnouncementTestOptions['gender'],
    rate: number,
    template: string,
    chimeEnabled: boolean,
    amountToman: number,
  ): Promise<VoiceAnnouncementTestResult>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  getVoiceGuardStatus(): Promise<VoiceGuardStatus | null>;
  restartVoiceGuard(): Promise<boolean>;
  openAutoStartSettings(): Promise<boolean>;
  getSherpaInfo(): Promise<SherpaModelInfo>;
  resetSherpaModel(): Promise<boolean>;
  saveSherpaConfig(
    pitch: number,
    gain: number,
    speakerId: number,
    threads: number,
  ): Promise<boolean>;
}

const native: SmsReaderNative | undefined =
  Platform.OS === 'android' ? (NativeModules.SmsReader as SmsReaderNative | undefined) : undefined;

/** True if native SMS reader module is linked (Android only) */
export const isSmsReaderAvailable = Boolean(native);

export async function hasSmsPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.hasPermission();
  } catch {
    return false;
  }
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.requestPermission();
  } catch {
    return false;
  }
}

export async function getRecentSmsSenders(): Promise<SmsSenderInfo[]> {
  if (!native) return [];
  try {
    const rows = await native.getRecentSmsSenders();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getSmsMessagesSince(timestamp: number, senders: string[]): Promise<RawSms[]> {
  if (!native || senders.length === 0) return [];
  try {
    const rows = await native.getSmsMessagesSince(timestamp, senders);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function setBankSenders(senders: string[]): void {
  try {
    native?.setBankSenders(senders);
  } catch {
    // Native module unavailable
  }
}

/**
 * Returns pending SMS messages stored by the native receiver without clearing the queue.
 * JavaScript must call `clearSmsQueue(maxSeq)` after successful SQLite persistence.
 */
export async function readSmsQueue(): Promise<SmsQueueSnapshot> {
  const empty: SmsQueueSnapshot = { messages: [], maxSeq: 0 };
  if (!native) return empty;

  try {
    const raw = await native.readQueue();
    const parsed = JSON.parse(raw ?? '{}');
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const maxSeq = Number(parsed?.maxSeq ?? 0);

    const messages = items
      .map((item: any): RawSms => ({
        id: String(item?.seq ?? item?.date ?? Date.now()),
        sender: String(item?.sender ?? ''),
        body: String(item?.body ?? ''),
        date: Number(item?.date ?? Date.now()),
        fingerprint: typeof item?.fingerprint === 'string' ? item.fingerprint : undefined,
      }))
      .filter((item: RawSms) => Boolean(item.sender && item.body));

    return { messages, maxSeq: Number.isFinite(maxSeq) ? maxSeq : 0 };
  } catch {
    return empty;
  }
}

/** Initial launch action if opened via bank SMS notification tap. */
export async function getInitialNotificationAction(): Promise<SmsNotificationAction | null> {
  if (!native?.getInitialNotificationAction) return null;
  try {
    const action = await native.getInitialNotificationAction();
    if (!action) return null;
    return {
      open: Boolean(action.open),
      smsFingerprint: action.smsFingerprint ?? null,
      url: action.url ?? null,
    };
  } catch {
    return null;
  }
}

/** Clear processed items up to maxSeq from the native buffer. */
export async function clearSmsQueue(maxSeq = Number.MAX_SAFE_INTEGER): Promise<void> {
  try {
    await native?.clearQueue(maxSeq);
  } catch {
    // Ignore error; duplicate check protects against re-reading
  }
}

/** Synchronizes announcer settings into native storage. */
export async function syncVoiceConfig(configJson: string): Promise<boolean> {
  if (!native?.syncVoiceConfig) return false;
  try {
    return Boolean(await native.syncVoiceConfig(configJson));
  } catch {
    return false;
  }
}

/** Dispatches live test announcement options directly to native engine. */
export async function testVoiceAnnouncement(
  options: VoiceAnnouncementTestOptions,
): Promise<VoiceAnnouncementTestResult> {
  const unavailable = {
    ok: false,
    engine: options.engine,
    message: 'ماژول صوتی اندروید در این نسخه در دسترس نیست.',
  };
  if (!native?.testVoiceAnnouncement) return unavailable;
  try {
    const result = await native.testVoiceAnnouncement(
      options.engine,
      options.gender,
      options.rate,
      options.template,
      options.chimeEnabled,
      options.amountToman,
    );
    return {
      ok: Boolean(result?.ok),
      engine: String(result?.engine ?? options.engine),
      message: typeof result?.message === 'string'
        ? result.message
        : result?.ok
          ? null
          : 'پخش با این موتور انجام نشد.',
    };
  } catch {
    return unavailable;
  }
}

/** Whether the app is exempt from battery optimization. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!native?.isIgnoringBatteryOptimizations) return true;
  try {
    return Boolean(await native.isIgnoringBatteryOptimizations());
  } catch {
    return true;
  }
}

/** Prompt or open system screen to disable battery optimization. */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (!native?.requestIgnoreBatteryOptimizations) return false;
  try {
    return Boolean(await native.requestIgnoreBatteryOptimizations());
  } catch {
    return false;
  }
}

/** Query persistent voice guard status. */
export async function getVoiceGuardStatus(): Promise<VoiceGuardStatus | null> {
  if (!native?.getVoiceGuardStatus) return null;
  try {
    const status = await native.getVoiceGuardStatus();
    if (!status) return null;
    return {
      enabled: Boolean(status.enabled),
      running: Boolean(status.running),
      lastSeen: Number(status.lastSeen ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/** Relaunch background voice announcer service. */
export async function restartVoiceGuard(): Promise<boolean> {
  if (!native?.restartVoiceGuard) return false;
  try {
    return Boolean(await native.restartVoiceGuard());
  } catch {
    return false;
  }
}

/** Open device-specific autostart or background activity screen. */
export async function openAutoStartSettings(): Promise<boolean> {
  if (!native?.openAutoStartSettings) return false;
  try {
    return Boolean(await native.openAutoStartSettings());
  } catch {
    return false;
  }
}

/** Query Sherpa-ONNX model diagnostic information. */
export async function getSherpaInfo(): Promise<SherpaModelInfo> {
  if (!native?.getSherpaInfo) {
    return { bundled: false, ready: false, modelName: '', modelBytes: 0, numSpeakers: 0 };
  }
  try {
    const res = await native.getSherpaInfo();
    return {
      bundled: Boolean(res?.bundled),
      ready: Boolean(res?.ready),
      modelName: typeof res?.modelName === 'string' ? res.modelName : '',
      modelBytes: Number(res?.modelBytes ?? 0),
      numSpeakers: Number(res?.numSpeakers ?? 0),
    };
  } catch {
    return { bundled: false, ready: false, modelName: '', modelBytes: 0, numSpeakers: 0 };
  }
}

/** Re-extract Sherpa model files in native storage. */
export async function resetSherpaModel(): Promise<boolean> {
  if (!native?.resetSherpaModel) return false;
  try {
    return Boolean(await native.resetSherpaModel());
  } catch {
    return false;
  }
}

/** Save Sherpa settings directly to native storage. */
export async function saveSherpaNativeConfig(
  pitch: number,
  gain: number,
  speakerId: number,
  threads: number,
): Promise<boolean> {
  if (!native?.saveSherpaConfig) return false;
  try {
    return Boolean(await native.saveSherpaConfig(pitch, gain, speakerId, threads));
  } catch {
    return false;
  }
}
