import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDatabase } from '../db/DatabaseProvider';
import { getSetting, setSetting } from '../db/settings';
import {
  DEFAULT_SHERPA_VOICE_GAIN,
  DEFAULT_SHERPA_VOICE_PITCH,
  DEFAULT_SHERPA_VOICE_SPEAKER_ID,
  DEFAULT_SHERPA_VOICE_THREADS,
  VOICE_ANNOUNCER_DEFAULT_RATE,
  VOICE_ANNOUNCER_GAIN_KEY,
  VOICE_ANNOUNCER_PITCH_KEY,
  VOICE_ANNOUNCER_RATE_KEY,
  VOICE_ANNOUNCER_SERVICE_OPTIONS,
  parseSherpaVoiceGain,
  parseSherpaVoicePitch,
  parseSherpaVoiceSpeakerId,
  parseSherpaVoiceThreads,
  parseVoiceAnnouncerRate,
  readVoiceAnnouncerSettings,
  SHERPA_VOICE_GAIN_KEY,
  SHERPA_VOICE_PITCH_KEY,
  SHERPA_VOICE_SPEAKER_ID_KEY,
  SHERPA_VOICE_THREADS_KEY,
  type VoiceAnnouncerService,
} from '../features/voiceAnnouncer';
import {
  getSherpaInfo,
  isSmsReaderAvailable,
  resetSherpaModel,
  saveSherpaNativeConfig,
  testVoiceAnnouncement,
  type SherpaModelInfo,
} from '../native/smsReader';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';

export interface SherpaVoiceSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Custom speech template for live testing */
  template?: string;
  /** Target service to tune; defaults to local or current service */
  service?: VoiceAnnouncerService;
}

const PITCH_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 0, label: 'خودکار', hint: 'بر اساس گوینده یا جنسیت' },
  { value: 0.75, label: 'خیلی بم', hint: 'تن فرکانسی ۰٫۷۵' },
  { value: 0.85, label: 'بم', hint: 'صدای بم و عمیق (۰٫۸۵)' },
  { value: 1.0, label: 'طبیعی', hint: 'بدون تغییر (۱٫۰۰)' },
  { value: 1.15, label: 'زیر', hint: 'صدای رسا و زیر (۱٫۱۵)' },
  { value: 1.25, label: 'خیلی زیر', hint: 'فرکانس بالا (۱٫۲۵)' },
];

const RATE_PRESETS: { value: number; label: string }[] = [
  { value: 0.8, label: 'آرام‌تر (۰٫۸)' },
  { value: 0.9, label: 'آرام (۰٫۹)' },
  { value: 1.0, label: 'معمولی (۱٫۰)' },
  { value: 1.1, label: 'تند (۱٫۱)' },
  { value: 1.25, label: 'تندتر (۱٫۲۵)' },
];

const GAIN_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 1.0, label: '۱۰۰٪ عادی', hint: 'بلندی استاندارد' },
  { value: 1.25, label: '۱۲۵٪ رسا', hint: 'تقویت صدا برای محیط‌های شلوغ' },
  { value: 1.5, label: '۱۵۰٪ بلند', hint: 'حداکثر تقویت مناسب رانندگی در خودرو' },
];

const THREADS_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 1, label: '۱ هسته', hint: 'کم‌مصرف‌ترین حالت پردازنده' },
  { value: 2, label: '۲ هسته (پیش‌فرض)', hint: 'تعادل ایده‌آل سرعت و مصرف باتری' },
  { value: 4, label: '۴ هسته', hint: 'حداکثر سرعت پردازش آفلاین' },
];

const SPEAKER_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: -1, label: 'خودکار', hint: 'بر اساس جنسیت زن/مرد انتخابی' },
  { value: 0, label: 'گوینده ۱ (اصلی)', hint: 'شناسه ۰ در مدل' },
  { value: 1, label: 'گوینده ۲', hint: 'شناسه ۱ در مدل‌های چندگوینده' },
];

export function SherpaVoiceSettingsSheet({
  visible,
  onClose,
  template,
  service = 'local',
}: SherpaVoiceSettingsSheetProps) {
  const database = useDatabase();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [rate, setRate] = useState<number>(VOICE_ANNOUNCER_DEFAULT_RATE);
  const [pitch, setPitch] = useState<number>(DEFAULT_SHERPA_VOICE_PITCH);
  const [gain, setGain] = useState<number>(DEFAULT_SHERPA_VOICE_GAIN);
  const [speakerId, setSpeakerId] = useState<number>(DEFAULT_SHERPA_VOICE_SPEAKER_ID);
  const [threads, setThreads] = useState<number>(DEFAULT_SHERPA_VOICE_THREADS);

  const [modelInfo, setModelInfo] = useState<SherpaModelInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [resettingModel, setResettingModel] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isLocalSherpa = service === 'local';

  // Load persisted voice settings
  const loadSettings = useCallback(() => {
    const rawRate = getSetting(database, VOICE_ANNOUNCER_RATE_KEY);
    const rawPitch =
      getSetting(database, VOICE_ANNOUNCER_PITCH_KEY) ??
      getSetting(database, SHERPA_VOICE_PITCH_KEY);
    const rawGain =
      getSetting(database, VOICE_ANNOUNCER_GAIN_KEY) ??
      getSetting(database, SHERPA_VOICE_GAIN_KEY);
    const rawSpeakerId = getSetting(database, SHERPA_VOICE_SPEAKER_ID_KEY);
    const rawThreads = getSetting(database, SHERPA_VOICE_THREADS_KEY);

    setRate(parseVoiceAnnouncerRate(rawRate));
    setPitch(parseSherpaVoicePitch(rawPitch));
    setGain(parseSherpaVoiceGain(rawGain));
    setSpeakerId(parseSherpaVoiceSpeakerId(rawSpeakerId));
    setThreads(parseSherpaVoiceThreads(rawThreads));
  }, [database]);

  // Refresh Sherpa model status
  const refreshModelInfo = useCallback(async () => {
    if (!isSmsReaderAvailable || !isLocalSherpa) return;
    setLoadingInfo(true);
    try {
      const info = await getSherpaInfo();
      setModelInfo(info);
    } finally {
      setLoadingInfo(false);
    }
  }, [isLocalSherpa]);

  useEffect(() => {
    if (visible) {
      loadSettings();
      void refreshModelInfo();
      setFeedback(null);
    }
  }, [visible, loadSettings, refreshModelInfo]);

  // Persist changes to database and native bridge
  const persistChanges = (
    nextRate: number,
    nextPitch: number,
    nextGain: number,
    nextSpeakerId: number,
    nextThreads: number,
  ) => {
    setSetting(database, VOICE_ANNOUNCER_RATE_KEY, String(nextRate));
    setSetting(database, VOICE_ANNOUNCER_PITCH_KEY, String(nextPitch));
    setSetting(database, VOICE_ANNOUNCER_GAIN_KEY, String(nextGain));
    setSetting(database, SHERPA_VOICE_PITCH_KEY, String(nextPitch));
    setSetting(database, SHERPA_VOICE_GAIN_KEY, String(nextGain));
    setSetting(database, SHERPA_VOICE_SPEAKER_ID_KEY, String(nextSpeakerId));
    setSetting(database, SHERPA_VOICE_THREADS_KEY, String(nextThreads));

    if (isSmsReaderAvailable) {
      void saveSherpaNativeConfig(nextPitch, nextGain, nextSpeakerId, nextThreads);
    }
  };

  const handleRateChange = (value: number) => {
    const next = Math.round(value * 100) / 100;
    setRate(next);
    persistChanges(next, pitch, gain, speakerId, threads);
  };

  const handlePitchChange = (value: number) => {
    const next = Math.round(value * 100) / 100;
    setPitch(next);
    persistChanges(rate, next, gain, speakerId, threads);
  };

  const handleGainChange = (value: number) => {
    setGain(value);
    persistChanges(rate, pitch, value, speakerId, threads);
  };

  const handleSpeakerChange = (value: number) => {
    setSpeakerId(value);
    persistChanges(rate, pitch, gain, value, threads);
  };

  const handleThreadsChange = (value: number) => {
    setThreads(value);
    persistChanges(rate, pitch, gain, speakerId, value);
  };

  const handleResetModel = () => {
    Alert.alert(
      'استخراج و آماده‌سازی مجدد مدل',
      'آیا می‌خواهی حافظه کش مدل صوتی آفلاین پاکسازی و از نو آماده‌سازی شود؟',
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'بله، بازنشانی شود',
          style: 'destructive',
          onPress: async () => {
            setResettingModel(true);
            try {
              const ok = await resetSherpaModel();
              if (ok) {
                setFeedback('مدل صوتی با موفقیت بازنشانی و آماده‌سازی شد.');
              } else {
                setFeedback('خطا در بازنشانی مدل صوتی.');
              }
              await refreshModelInfo();
            } finally {
              setResettingModel(false);
            }
          },
        },
      ],
    );
  };

  const handleResetDefaults = () => {
    setRate(VOICE_ANNOUNCER_DEFAULT_RATE);
    setPitch(DEFAULT_SHERPA_VOICE_PITCH);
    setGain(DEFAULT_SHERPA_VOICE_GAIN);
    setSpeakerId(DEFAULT_SHERPA_VOICE_SPEAKER_ID);
    setThreads(DEFAULT_SHERPA_VOICE_THREADS);
    persistChanges(
      VOICE_ANNOUNCER_DEFAULT_RATE,
      DEFAULT_SHERPA_VOICE_PITCH,
      DEFAULT_SHERPA_VOICE_GAIN,
      DEFAULT_SHERPA_VOICE_SPEAKER_ID,
      DEFAULT_SHERPA_VOICE_THREADS,
    );
    setFeedback('تنظیمات صدا به مقادیر پیش‌فرض بازگشت.');
  };

  const handleTestNow = async () => {
    if (testingVoice) return;
    setTestingVoice(true);
    setFeedback(null);
    try {
      const voice = readVoiceAnnouncerSettings(database);
      const res = await testVoiceAnnouncement({
        engine: service,
        gender: voice.gender,
        rate,
        template: template ?? voice.template,
        chimeEnabled: voice.chime,
        amountToman: 70_000,
      });
      if (res.ok) {
        setFeedback('پخش آزمایشی صدا با موفقیت انجام شد.');
      } else {
        setFeedback(res.message ?? 'خطا در پخش صدا.');
      }
    } catch {
      setFeedback('اجرای آزمایشی صدا ممکن نشد.');
    } finally {
      setTestingVoice(false);
    }
  };

  const serviceLabel =
    VOICE_ANNOUNCER_SERVICE_OPTIONS.find((opt) => opt.value === service)?.label ??
    'سرویس صوتی';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="بستن" />

        <View style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleWithIcon}>
              <View style={styles.headerIcon}>
                <Ionicons
                  name={isLocalSherpa ? 'hardware-chip-outline' : 'options-outline'}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View>
                <AppText variant="subtitle" style={styles.titleText}>
                  {isLocalSherpa
                    ? 'تنظیمات صدای عصبی روی گوشی'
                    : `شخصی‌سازی تن و سرعت: ${serviceLabel}`}
                </AppText>
                <AppText variant="caption" style={styles.subtitleText}>
                  {isLocalSherpa
                    ? 'موتور بومی Sherpa-ONNX و مدل Piper VITS'
                    : 'تنظیم دقیق سرعت، زیروبمی (بم/زیر) و بلندی صدا'}
                </AppText>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* Speed / Rate control */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="speedometer-outline" size={17} color={colors.primary} />
                <AppText variant="label" style={styles.sectionTitle}>
                  سرعت گفتار (Speed Rate)
                </AppText>
              </View>
              <AppText variant="caption" style={styles.mutedHint}>
                تنظیم سرعت خواندن جمله؛ مقادیر کمتر برای ادای آرام‌تر و مقادیر بیشتر برای گفتار سریع‌تر:
              </AppText>

              <View style={styles.chipsContainer}>
                {RATE_PRESETS.map((item) => {
                  const active = Math.abs(rate - item.value) < 0.03;
                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleRateChange(item.value)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <AppText
                        variant="caption"
                        style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.stepperRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="آرام‌تر کردن سرعت"
                  onPress={() => handleRateChange(Math.max(0.6, rate - 0.05))}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
                  <Ionicons name="remove" size={18} color={colors.text} />
                </Pressable>

                <View style={styles.stepperValueContainer}>
                  <AppText variant="body" style={styles.stepperValueText}>
                    {`سرعت گفتار: ${toPersianDigits(rate.toFixed(2))} برابر`}
                  </AppText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="تندتر کردن سرعت"
                  onPress={() => handleRateChange(Math.min(1.4, rate + 0.05))}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
                  <Ionicons name="add" size={18} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Tone / Pitch control */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="musical-notes-outline" size={17} color={colors.primary} />
                <AppText variant="label" style={styles.sectionTitle}>
                  زیروبمی و تن صدا (Voice Pitch & Tone)
                </AppText>
              </View>
              <AppText variant="caption" style={styles.mutedHint}>
                تنظیم فرکانس و بم/زیر بودن صدا بدون تغییر در سرعت گفتار (بم‌تر برای صدای عمیق، زیرتر برای صدای رسا):
              </AppText>

              <View style={styles.chipsContainer}>
                {PITCH_PRESETS.map((item) => {
                  const active =
                    item.value === 0 ? pitch === 0 : Math.abs(pitch - item.value) < 0.03;
                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => handlePitchChange(item.value)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <AppText
                        variant="caption"
                        style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.stepperRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="بم‌تر کردن تن صدا"
                  onPress={() => handlePitchChange(Math.max(0.7, (pitch || 1.0) - 0.05))}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
                  <Ionicons name="remove" size={18} color={colors.text} />
                </Pressable>

                <View style={styles.stepperValueContainer}>
                  <AppText variant="body" style={styles.stepperValueText}>
                    {pitch === 0
                      ? 'تن صدا: خودکار'
                      : `تن صدا: ${toPersianDigits(pitch.toFixed(2))} ${
                          pitch < 0.95 ? '(بم)' : pitch > 1.05 ? '(زیر)' : '(طبیعی)'
                        }`}
                  </AppText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="زیرتر کردن تن صدا"
                  onPress={() => handlePitchChange(Math.min(1.35, (pitch || 1.0) + 0.05))}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
                  <Ionicons name="add" size={18} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Volume gain control */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="volume-high-outline" size={17} color={colors.primary} />
                <AppText variant="label" style={styles.sectionTitle}>
                  بلندی و تقویت صدا (Volume Gain)
                </AppText>
              </View>
              <AppText variant="caption" style={styles.mutedHint}>
                تقویت سطح بلندی خروجی برای شنیده شدن شفاف در خودرو یا محیط‌های شلوغ:
              </AppText>

              <View style={styles.chipsContainer}>
                {GAIN_OPTIONS.map((item) => {
                  const active = Math.abs(gain - item.value) < 0.05;
                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleGainChange(item.value)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <AppText
                        variant="caption"
                        style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Local Sherpa dedicated options */}
            {isLocalSherpa ? (
              <>
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="person-outline" size={17} color={colors.primary} />
                    <AppText variant="label" style={styles.sectionTitle}>
                      انتخاب گوینده در مدل (Speaker ID)
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.mutedHint}>
                    در مدل‌های چندگوینده، انتخاب شماره گوینده یا انتخاب خودکار بر اساس جنسیت:
                  </AppText>

                  <View style={styles.chipsContainer}>
                    {SPEAKER_OPTIONS.map((item) => {
                      const active = speakerId === item.value;
                      return (
                        <Pressable
                          key={item.label}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          onPress={() => handleSpeakerChange(item.value)}
                          style={[styles.chip, active && styles.chipActive]}>
                          <AppText
                            variant="caption"
                            style={[styles.chipText, active && styles.chipTextActive]}>
                            {item.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="hardware-chip-outline" size={17} color={colors.primary} />
                    <AppText variant="label" style={styles.sectionTitle}>
                      هسته‌های پردازشی CPU (سرعت و باتری)
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.mutedHint}>
                    تعداد رشته‌های پردازش هم‌زمان مدل VITS روی گوشی:
                  </AppText>

                  <View style={styles.chipsContainer}>
                    {THREADS_OPTIONS.map((item) => {
                      const active = threads === item.value;
                      return (
                        <Pressable
                          key={item.label}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          onPress={() => handleThreadsChange(item.value)}
                          style={[styles.chip, active && styles.chipActive]}>
                          <AppText
                            variant="caption"
                            style={[styles.chipText, active && styles.chipTextActive]}>
                            {item.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="information-circle-outline" size={17} color={colors.primary} />
                    <AppText variant="label" style={styles.sectionTitle}>
                      وضعیت و مشخصات مدل در دستگاه
                    </AppText>
                  </View>

                  {isSmsReaderAvailable ? (
                    <View style={styles.statusBox}>
                      <View style={styles.statusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor:
                                modelInfo?.ready || modelInfo?.bundled
                                  ? colors.income
                                  : colors.warning,
                            },
                          ]}
                        />
                        <AppText variant="caption" style={styles.statusLabel}>
                          {loadingInfo
                            ? 'در حال بررسی وضعیت مدل…'
                            : modelInfo?.ready
                              ? 'مدل استخراج‌شده و آماده به کار آفلاین'
                              : modelInfo?.bundled
                                ? 'مدل در بسته نصبی آماده است (استخراج در اولین اجرا)'
                                : 'مدل در حال آماده‌سازی…'}
                        </AppText>
                      </View>

                      {modelInfo?.modelName ? (
                        <AppText variant="caption" style={styles.statusDetail}>
                          {`فایل مدل: ${modelInfo.modelName} (${toPersianDigits(
                            (modelInfo.modelBytes / (1024 * 1024)).toFixed(1),
                          )} مگابایت)`}
                        </AppText>
                      ) : null}

                      <Pressable
                        accessibilityRole="button"
                        disabled={resettingModel}
                        onPress={handleResetModel}
                        style={({ pressed }) => [
                          styles.resetModelChip,
                          pressed && styles.pressed,
                        ]}>
                        {resettingModel ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                        )}
                        <AppText variant="caption" style={styles.resetModelText}>
                          بازنشانی و آماده‌سازی مجدد مدل
                        </AppText>
                      </Pressable>
                    </View>
                  ) : (
                    <AppText variant="caption" style={styles.mutedHint}>
                      موتور Sherpa-ONNX اختصاصی اندروید است؛ تنظیمات شما ذخیره شده و روی گوشی فعال خواهد بود.
                    </AppText>
                  )}
                </View>
              </>
            ) : null}

            {/* Feedback message */}
            {feedback ? (
              <View style={styles.feedbackBox}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
                <AppText variant="caption" style={styles.feedbackText}>
                  {feedback}
                </AppText>
              </View>
            ) : null}

            {/* Live test button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تست صدا با این تنظیمات"
              disabled={testingVoice}
              onPress={() => void handleTestNow()}
              style={({ pressed }) => [
                styles.testButton,
                pressed && styles.pressed,
                testingVoice && styles.busy,
              ]}>
              {testingVoice ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="volume-high" size={18} color={colors.white} />
              )}
              <AppText variant="label" style={styles.testButtonText}>
                {testingVoice ? 'در حال پخش آزمایشی…' : 'تست صدا با این تنظیمات 🔊'}
              </AppText>
            </Pressable>

            {/* Factory defaults reset */}
            <Pressable
              accessibilityRole="button"
              onPress={handleResetDefaults}
              style={({ pressed }) => [styles.resetDefaultsButton, pressed && styles.pressed]}>
              <Ionicons name="refresh" size={14} color={colors.textMuted} />
              <AppText variant="caption" style={styles.resetDefaultsText}>
                بازگردانی به مقادیر پیش‌فرض کارخانه
              </AppText>
            </Pressable>
          </ScrollView>

          {/* Footer close button */}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeSubmitButton, pressed && styles.pressed]}>
            <AppText variant="label" style={styles.closeSubmitText}>
              تایید و بستن پنل
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: '90%',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    headerRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    titleWithIcon: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleText: {
      textAlign: 'right',
      writingDirection: 'rtl',
      fontWeight: 'bold',
    },
    subtitleText: {
      textAlign: 'right',
      writingDirection: 'rtl',
      color: colors.textMuted,
      fontSize: 11,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollArea: {
      marginTop: spacing.sm,
    },
    scrollContent: {
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    sectionCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.xs,
    },
    sectionHeader: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sectionTitle: {
      textAlign: 'right',
      writingDirection: 'rtl',
      fontSize: 13,
      fontWeight: '600',
    },
    mutedHint: {
      textAlign: 'right',
      writingDirection: 'rtl',
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
    },
    chipsContainer: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    chipText: {
      textAlign: 'right',
      writingDirection: 'rtl',
      color: colors.text,
      fontSize: 12,
    },
    chipTextActive: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    stepperRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.xs,
      marginTop: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    stepperButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValueContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValueText: {
      textAlign: 'center',
      fontWeight: '600',
      fontSize: 13,
    },
    statusBox: {
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    statusRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
    },
    statusLabel: {
      textAlign: 'right',
      writingDirection: 'rtl',
      fontWeight: '500',
    },
    statusDetail: {
      textAlign: 'right',
      writingDirection: 'rtl',
      color: colors.textFaint,
      fontSize: 11,
    },
    resetModelChip: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.primarySoft,
      marginTop: spacing.xs,
    },
    resetModelText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '500',
    },
    feedbackBox: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
    },
    feedbackText: {
      flex: 1,
      textAlign: 'right',
      writingDirection: 'rtl',
      color: colors.primary,
      fontSize: 12,
    },
    testButton: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      marginTop: spacing.xs,
    },
    testButtonText: {
      color: colors.white,
      fontWeight: 'bold',
      fontSize: 14,
    },
    resetDefaultsButton: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    resetDefaultsText: {
      color: colors.textMuted,
      fontSize: 11,
    },
    closeSubmitButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.xs,
    },
    closeSubmitText: {
      color: colors.text,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.8,
    },
    busy: {
      opacity: 0.7,
    },
  });
