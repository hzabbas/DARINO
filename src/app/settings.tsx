import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { MoneyInput } from '../components/MoneyInput';
import { Screen } from '../components/Screen';
import { useDatabase } from '../db/DatabaseProvider';
import { backupToJson, buildBackupFileName, restoreBackup } from '../db/backup';
import { countCategories } from '../db/categories';
import { clearPendingSmsQueue, countPendingSms } from '../db/pendingSms';
import { factoryReset, resetTransactionsAndBalances } from '../db/reset';
import { getNumericSetting, setSetting } from '../db/settings';
import { countTransactions, listTransactions } from '../db/transactions';
import {
  VOICE_ANNOUNCER_CHIME_KEY,
  VOICE_ANNOUNCER_ENABLED_KEY,
  VOICE_ANNOUNCER_GENDER_KEY,
  playVoiceAnnouncerTest,
  readVoiceAnnouncerSettings,
  type VoiceAnnouncerGender,
} from '../features/voiceAnnouncer';
import { useDbQuery } from '../hooks/useDbQuery';
import { useScreenFocusScroll } from '../hooks/useFocusScroll';
import { clearSmsQueue, isSmsReaderAvailable, setBankSenders } from '../native/smsReader';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors, type ThemeMode } from '../theme';
import { parseAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { confirmAction, notify } from '../utils/dialogs';
import { toPersianErrorMessage } from '../utils/errors';
import { buildCsvFileName, buildTransactionsCsv } from '../utils/csv';
import { shareTextFile } from '../utils/exportFile';

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
  tone?: 'primary' | 'expense';
}

function ActionRow({ icon, title, subtitle, onPress, busy = false, tone = 'primary' }: ActionRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
      <View
        style={[
          styles.actionIcon,
          tone === 'expense' && { backgroundColor: colors.expenseSoft },
        ]}>
        <Ionicons
          name={icon}
          size={19}
          color={tone === 'expense' ? colors.expense : colors.primary}
        />
      </View>
      <View style={styles.actionTexts}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" style={styles.actionSubtitle}>
          {subtitle}
        </AppText>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'روشن', icon: 'sunny-outline' },
  { value: 'dark', label: 'تاریک', icon: 'moon-outline' },
  { value: 'system', label: 'خودکار', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen() {
  const database = useDatabase();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // ورودی‌های هدف و بودجه داخل اسکرول Screen هستند؛ با فوکوس به بالای کیبورد می‌آیند
  const screenScroll = useScreenFocusScroll();

  const [busy, setBusy] = useState<
    'export' | 'import' | 'csv' | 'pending-sms' | 'reset-transactions' | 'factory' | null
  >(null);
  const [incomeGoalInput, setIncomeGoalInput] = useState(() =>
    String(getNumericSetting(database, 'income_goal') || ''),
  );
  const [budgetInput, setBudgetInput] = useState(() =>
    String(getNumericSetting(database, 'expense_budget') || ''),
  );
  const [testingVoice, setTestingVoice] = useState(false);

  const { data, reload } = useDbQuery((db) => ({
    categories: countCategories(db),
    transactions: countTransactions(db),
    voice: readVoiceAnnouncerSettings(db),
  }));

  const categoriesCount = data?.categories ?? 0;
  const transactionsCount = data?.transactions ?? 0;
  const voice = data?.voice ?? { enabled: true, gender: 'female' as VoiceAnnouncerGender, chime: true };
  const version = Constants.expoConfig?.version ?? '2.0.0';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleOpenRepository = () => {
    const url = 'https://github.com/hzabbas/DARINO';
    Linking.openURL(url).catch(() => notify('باز کردن لینک ممکن نشد', url));
  };

  const handleSaveGoals = () => {
    const incomeGoal = parseAmount(incomeGoalInput);
    const expenseBudget = parseAmount(budgetInput);
    setSetting(database, 'income_goal', String(incomeGoal));
    setSetting(database, 'expense_budget', String(expenseBudget));
    notify('ذخیره شد', 'هدف درآمد و سقف بودجه‌ی ماهانه به‌روز شد.');
  };

  const handleToggleVoice = () => {
    setSetting(database, VOICE_ANNOUNCER_ENABLED_KEY, voice.enabled ? 'false' : 'true');
    reload();
  };

  const handleVoiceGender = (gender: VoiceAnnouncerGender) => {
    setSetting(database, VOICE_ANNOUNCER_GENDER_KEY, gender);
    reload();
  };

  const handleToggleVoiceChime = () => {
    setSetting(database, VOICE_ANNOUNCER_CHIME_KEY, voice.chime ? 'false' : 'true');
    reload();
  };

  const handleTestVoice = async () => {
    if (testingVoice) return;
    if (!isSmsReaderAvailable) {
      notify(
        'فقط در نسخه‌ی اندروید',
        'اعلام صوتی واریز در نسخه‌ی وب یا Expo Go در دسترس نیست.',
      );
      return;
    }

    setTestingVoice(true);
    try {
      const played = await playVoiceAnnouncerTest(voice);
      if (!played) {
        notify(
          'پخش نشد',
          'گوینده در دسترس نبود. اتصال اینترنت را بررسی کن؛ اگر آفلاین باشی، از گوینده‌ی خود گوشی استفاده می‌شود.',
        );
      }
    } finally {
      setTestingVoice(false);
    }
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const json = backupToJson(database);
      const result = await shareTextFile(
        buildBackupFileName(),
        json,
        'application/json',
        'پشتیبان دارینو',
      );
      if (!result.shared && result.uri) {
        notify('فایل پشتیبان ذخیره شد', result.uri);
      }
    } catch (error) {
      notify('پشتیبان‌گیری انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async () => {
    if (busy) return;
    setBusy('csv');
    try {
      const rows = listTransactions(database, null);
      if (rows.length === 0) {
        notify('خروجی اکسل', 'هنوز تراکنشی برای خروجی گرفتن ثبت نشده است.');
        return;
      }
      const csv = buildTransactionsCsv(rows);
      const result = await shareTextFile(
        buildCsvFileName(),
        csv,
        'text/csv',
        'خروجی اکسل دارینو',
      );
      if (!result.shared && result.uri) {
        notify('فایل CSV ذخیره شد', result.uri);
      }
    } catch (error) {
      notify('خروجی اکسل انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async (uri: string) => {
    setBusy('import');
    try {
      const content =
        Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();

      const result = restoreBackup(database, content);
      reload();
      notify(
        'بازیابی کامل شد',
        `${toPersianDigits(result.categories)} دسته‌بندی، ${toPersianDigits(
          result.transactions,
        )} تراکنش و ${toPersianDigits(result.accounts)} حساب بازگردانی شد.`,
      );
    } catch (error) {
      notify('بازیابی انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) {
        return;
      }
      const uri = picked.assets[0].uri;
      confirmAction({
        title: 'بازیابی از پشتیبان',
        message: 'همه‌ی دسته‌بندی‌ها و تراکنش‌های فعلی جایگزین می‌شوند. ادامه می‌دهی؟',
        confirmLabel: 'بازیابی',
        destructive: true,
        onConfirm: () => {
          runRestore(uri);
        },
      });
    } catch (error) {
      notify('انتخاب فایل انجام نشد', toPersianErrorMessage(error));
    }
  };

  /**
   * «پاک کردن پیامک‌های تاییدنشده»: فقط صف تایید.
   *
   * علاوه بر جدول `pending_sms`، صف بومی گوشی هم خالی می‌شود؛ گیرنده‌ی بومی پیامک‌هایی
   * را که هنگام بسته‌بودن برنامه رسیده‌اند نگه می‌دارد و اگر خالی نشود، همان‌ها بلافاصله
   * بعد از ریست دوباره به صف تایید برمی‌گردند.
   */
  const runClearPendingSms = async () => {
    setBusy('pending-sms');
    try {
      const deleted = clearPendingSmsQueue(database);
      await clearSmsQueue();
      reload();
      notify(
        deleted > 0 ? 'صف تایید خالی شد' : 'صف تایید خالی بود',
        deleted > 0
          ? `${toPersianDigits(deleted)} پیامک تاییدنشده پاک شد؛ تراکنش‌ها، حساب‌ها و دسته‌بندی‌ها دست‌نخورده ماندند.`
          : 'پیامکی برای پاک کردن نبود؛ صف پیامک‌های ذخیره‌شده‌ی گوشی هم خالی شد.',
      );
    } catch (error) {
      notify('پاک کردن انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleClearPendingSms = () => {
    if (busy) return;
    const pendingCount = countPendingSms(database);
    confirmAction({
      title: 'پاک کردن پیامک‌های تاییدنشده',
      message:
        pendingCount > 0
          ? `${toPersianDigits(pendingCount)} پیامک منتظر تایید برای همیشه حذف می‌شود. تراکنش‌ها، حساب‌های بانکی و دسته‌بندی‌ها دست‌نخورده می‌مانند. ادامه می‌دهی؟`
          : 'پیامکی در صف تایید نیست، ولی صف پیامک‌های ذخیره‌شده‌ی گوشی هم خالی می‌شود. تراکنش‌ها و حساب‌ها دست‌نخورده می‌مانند. ادامه می‌دهی؟',
      confirmLabel: 'پاک کن',
      destructive: true,
      onConfirm: () => {
        void runClearPendingSms();
      },
    });
  };

  /**
   * «حذف تراکنش‌ها و صفر کردن موجودی‌ها»: تراکنش‌ها و صف پیامک حذف و موجودی همه‌ی
   * حساب‌ها صفر می‌شود، ولی تعریف حساب‌های بانکی و دسته‌بندی‌های کاربر باقی می‌مانند.
   * صف بومی هم خالی می‌شود تا پیامک‌های قدیمی دوباره به صف تایید نریزند.
   */
  const runResetTransactions = async () => {
    setBusy('reset-transactions');
    try {
      const summary = resetTransactionsAndBalances(database);
      await clearSmsQueue();
      reload();
      notify(
        'تراکنش‌ها حذف و موجودی‌ها صفر شد',
        `${toPersianDigits(summary.transactions)} تراکنش و ${toPersianDigits(
          summary.pendingSms,
        )} پیامک صف تایید حذف شد و موجودی ${toPersianDigits(
          summary.accountsZeroed,
        )} حساب صفر شد. حساب‌های بانکی و دسته‌بندی‌ها دست‌نخورده ماندند.`,
      );
    } catch (error) {
      notify('ریست انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleResetTransactions = () => {
    if (busy) return;
    confirmAction({
      title: 'حذف تراکنش‌ها و صفر کردن موجودی‌ها',
      message:
        'همه‌ی تراکنش‌ها و همه‌ی پیامک‌های صف تایید حذف می‌شوند و موجودی همه‌ی حساب‌های بانکی صفر می‌شود. حساب‌های بانکی و دسته‌بندی‌ها باقی می‌مانند. این کار برگشت‌ناپذیر است؛ ادامه می‌دهی؟',
      confirmLabel: 'حذف و صفر کن',
      destructive: true,
      onConfirm: () => {
        void runResetTransactions();
      },
    });
  };

  /**
   * «ریست کارخانه»: همه‌چیز پاک و دسته‌بندی‌های پیش‌فرض بازساخته می‌شوند.
   *
   * بعد از ریست، صف بومی خالی و فهرست سرشماره‌های گیرنده‌ی بومی هم صفر می‌شود؛ وگرنه
   * گیرنده به سرشماره‌هایی واکنش نشان می‌دهد که حسابشان دیگر وجود ندارد.
   */
  const runFactoryReset = async () => {
    setBusy('factory');
    try {
      const summary = factoryReset(database);
      await clearSmsQueue();
      setBankSenders([]);
      // تنظیمات هم پاک شده‌اند؛ فیلدهای هدف و بودجه باید خالی شوند تا عدد قدیمی نشان ندهند
      setIncomeGoalInput('');
      setBudgetInput('');
      reload();
      notify(
        'ریست کارخانه انجام شد',
        `${toPersianDigits(summary.transactions)} تراکنش، ${toPersianDigits(
          summary.pendingSms,
        )} پیامک صف تایید، ${toPersianDigits(summary.accounts)} حساب بانکی، ${toPersianDigits(
          summary.categories,
        )} دسته‌بندی و ${toPersianDigits(summary.settings)} تنظیم حذف شد و ${toPersianDigits(
          summary.seeded,
        )} دسته‌بندی پیش‌فرض بازساخته شد.`,
      );
    } catch (error) {
      notify('ریست کارخانه انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleFactoryReset = () => {
    if (busy) return;
    confirmAction({
      title: 'ریست کارخانه',
      message:
        'هشدار: همه‌ی اطلاعات برای همیشه حذف می‌شود؛ تراکنش‌ها، پیامک‌ها، حساب‌های بانکی، دسته‌بندی‌ها و تنظیمات. بعد از این کار فقط دسته‌بندی‌های پیش‌فرض ساخته می‌شوند و هیچ راهی برای بازگرداندن اطلاعات نیست. تا از فایل پشتیبان مطمئن نشده‌ای ادامه نده. ادامه می‌دهی؟',
      confirmLabel: 'بله، همه‌چیز حذف شود',
      destructive: true,
      onConfirm: () => {
        void runFactoryReset();
      },
    });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <AppText variant="title">تنظیمات</AppText>
          <AppText variant="caption" style={styles.headerSubtitle}>
            ظاهر، هدف‌گذاری، پشتیبان‌گیری و درباره‌ی برنامه
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="بستن"
          hitSlop={8}
          onPress={handleBack}
          style={styles.closeButton}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      <Card style={styles.summaryCard}>
        <View style={styles.appIcon}>
          <Ionicons name="wallet-outline" size={22} color={colors.white} />
        </View>
        <View style={styles.summaryTexts}>
          <AppText variant="label">دارینو</AppText>
          <AppText variant="caption" style={styles.summaryMeta}>
            {`${toPersianDigits(categoriesCount)} دسته‌بندی · ${toPersianDigits(
              transactionsCount,
            )} تراکنش`}
          </AppText>
        </View>
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        ظاهر برنامه
      </AppText>

      <Card style={styles.themeCard}>
        {THEME_OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setMode(option.value)}
              style={[styles.themeOption, active && styles.themeOptionActive]}>
              <Ionicons
                name={option.icon}
                size={18}
                color={active ? colors.primary : colors.textMuted}
              />
              <AppText
                variant="caption"
                style={[styles.themeLabel, active && styles.themeLabelActive]}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        حساب‌ها و پیامک
      </AppText>

      <Card style={styles.actionsCard}>
        <ActionRow
          icon="card-outline"
          title="حساب‌های بانکی و پیامک‌خوان"
          subtitle="موجودی، سرشماره‌ها، صف تایید و شبیه‌ساز پیامک"
          onPress={() => router.push('/banks')}
        />
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        اعلام صوتی واریز وجه (حالت رانندگی)
      </AppText>

      <Card style={styles.voiceCard}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: voice.enabled }}
          onPress={handleToggleVoice}
          style={styles.switchRow}>
          <View style={styles.switchTexts}>
            <AppText variant="label">فعال‌سازی اعلام صوتی واریزها</AppText>
            <AppText variant="caption" style={styles.mutedText}>
              وقتی پول به کارت انتخاب‌شده برسد، مبلغ با جمله‌ی خودمانی گفته می‌شود؛ حتی
              وقتی دارینو بسته است و صفحه خاموش است.
            </AppText>
          </View>
          <Ionicons
            name={voice.enabled ? 'toggle' : 'toggle-outline'}
            size={30}
            color={voice.enabled ? colors.primary : colors.textFaint}
          />
        </Pressable>

        <View style={styles.separator} />

        <View style={styles.voiceBlock}>
          <AppText variant="caption" style={styles.mutedText}>
            صدای گوینده
          </AppText>
          <View style={styles.genderRow}>
            {(
              [
                { value: 'female', label: 'زن (طبیعی)', icon: 'woman-outline' },
                { value: 'male', label: 'مرد (طبیعی)', icon: 'man-outline' },
              ] as const
            ).map((option) => {
              const active = voice.gender === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => handleVoiceGender(option.value)}
                  style={[styles.genderOption, active && styles.genderOptionActive]}>
                  <Ionicons
                    name={option.icon}
                    size={17}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <AppText
                    variant="caption"
                    style={[styles.genderLabel, active && styles.genderLabelActive]}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.separator} />

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: voice.chime }}
          onPress={handleToggleVoiceChime}
          style={styles.switchRow}>
          <View style={styles.switchTexts}>
            <AppText variant="label">پخش صدای زنگ کوتاه قبل از اعلام</AppText>
            <AppText variant="caption" style={styles.mutedText}>
              یک «دینگ» نرم پیش از گفتن مبلغ.
            </AppText>
          </View>
          <Ionicons
            name={voice.chime ? 'toggle' : 'toggle-outline'}
            size={30}
            color={voice.chime ? colors.primary : colors.textFaint}
          />
        </Pressable>

        <View style={styles.separator} />

        <Pressable
          accessibilityRole="button"
          disabled={testingVoice}
          onPress={handleTestVoice}
          style={({ pressed }) => [
            styles.voiceTestButton,
            pressed && styles.savePressed,
            testingVoice && styles.voiceTestBusy,
          ]}>
          {testingVoice ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="volume-high" size={16} color={colors.white} />
          )}
          <AppText variant="caption" style={styles.saveText}>
            تست صدای گوینده 🔊
          </AppText>
        </Pressable>

        <AppText variant="caption" style={styles.goalHint}>
          جمله‌ی نمونه: «علی محمدی، هفتاد تومن برات واریز کرد». گوینده‌ی طبیعی از
          اینترنت استفاده می‌کند؛ اگر آفلاین باشی، خود گوشی جمله را می‌خواند.
        </AppText>
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        هدف درآمد و سقف بودجه
      </AppText>

      <Card style={styles.goalCard}>
        <MoneyInput
          label="هدف درآمد ماهانه (تومان)"
          value={incomeGoalInput}
          onChangeValue={setIncomeGoalInput}
          onFocus={screenScroll?.onFocus}
          emptyHint="خالی بگذاری یعنی هدفی تعیین نشده است."
        />

        <MoneyInput
          label="سقف بودجه‌ی هزینه ماهانه (تومان)"
          value={budgetInput}
          onChangeValue={setBudgetInput}
          onFocus={screenScroll?.onFocus}
          emptyHint="خالی بگذاری یعنی سقف بودجه‌ای تعیین نشده است."
        />

        <Pressable
          accessibilityRole="button"
          onPress={handleSaveGoals}
          style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
          <AppText variant="caption" style={styles.saveText}>
            ذخیره‌ی هدف و بودجه
          </AppText>
        </Pressable>

        <AppText variant="caption" style={styles.goalHint}>
          با عبور از ۸۰٪ بودجه هشدار زرد و با عبور از ۱۰۰٪ هشدار قرمز در داشبورد نمایش داده می‌شود.
        </AppText>
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        پشتیبان‌گیری و خروجی
      </AppText>

      <Card style={styles.actionsCard}>
        <ActionRow
          icon="share-outline"
          title="ساخت فایل پشتیبان (JSON)"
          subtitle="ذخیره یا ارسال فایل در تلگرام، فایل منیجر و …"
          onPress={handleExport}
          busy={busy === 'export'}
        />
        <View style={styles.separator} />
        <ActionRow
          icon="document-text-outline"
          title="خروجی اکسل (CSV)"
          subtitle="همه‌ی تراکنش‌ها؛ سازگار با Excel و Google Sheets"
          onPress={handleExportCsv}
          busy={busy === 'csv'}
        />
        <View style={styles.separator} />
        <ActionRow
          icon="folder-open-outline"
          title="بازیابی از فایل پشتیبان"
          subtitle="انتخاب فایل JSON و جایگزینی همه‌ی اطلاعات فعلی"
          onPress={handleImport}
          busy={busy === 'import'}
          tone="expense"
        />
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        مدیریت و ریست اطلاعات
      </AppText>

      {/* کارت مخرب: نوار هشدار قرمز بالای سه عملیات برگشت‌ناپذیر */}
      <Card style={styles.dangerCard}>
        <View style={styles.dangerHeader}>
          <Ionicons name="warning-outline" size={16} color={colors.expense} />
          <AppText variant="caption" style={styles.dangerHeaderText}>
            این کارها برگشت‌ناپذیرند و هر کدام قبل از اجرا تأیید جداگانه می‌خواهند.
          </AppText>
        </View>
        <ActionRow
          icon="mail-unread-outline"
          title="پاک کردن پیامک‌های تاییدنشده"
          subtitle="فقط صف تایید خالی می‌شود؛ تراکنش‌ها، حساب‌ها و دسته‌بندی‌ها دست‌نخورده می‌مانند."
          onPress={handleClearPendingSms}
          busy={busy === 'pending-sms'}
          tone="expense"
        />
        <View style={styles.separator} />
        <ActionRow
          icon="trash-outline"
          title="حذف تراکنش‌ها و صفر کردن موجودی‌ها"
          subtitle="همه‌ی تراکنش‌ها و صف پیامک حذف و موجودی حساب‌ها صفر می‌شود؛ حساب‌ها و دسته‌بندی‌ها می‌مانند."
          onPress={handleResetTransactions}
          busy={busy === 'reset-transactions'}
          tone="expense"
        />
        <View style={styles.separator} />
        <ActionRow
          icon="nuclear-outline"
          title="ریست کارخانه"
          subtitle="همه‌چیز حذف می‌شود: تراکنش‌ها، حساب‌های بانکی، دسته‌بندی‌ها و تنظیمات؛ سپس دسته‌بندی‌های پیش‌فرض بازساخته می‌شوند."
          onPress={handleFactoryReset}
          busy={busy === 'factory'}
          tone="expense"
        />
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        درباره دارینو
      </AppText>

      <Card style={styles.aboutCard}>
        <View style={styles.aboutHeader}>
          <View style={styles.appIcon}>
            <Ionicons name="wallet-outline" size={22} color={colors.white} />
          </View>
          <View style={styles.summaryTexts}>
            <AppText variant="label">دارینو</AppText>
            <AppText variant="caption" style={styles.summaryMeta}>
              مدیریت دخل‌وخرج شخصی، کاملاً آفلاین
            </AppText>
          </View>
        </View>

        <View style={styles.aboutSeparator} />

        <View style={styles.aboutRow}>
          <AppText variant="caption" style={styles.aboutLabel}>
            نسخه
          </AppText>
          <AppText variant="label">{toPersianDigits(version)}</AppText>
        </View>

        <View style={styles.aboutRow}>
          <AppText variant="caption" style={styles.aboutLabel}>
            توسعه‌دهنده
          </AppText>
          <AppText variant="label">Abbas Hz</AppText>
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="مخزن گیت‌هاب دارینو"
          onPress={handleOpenRepository}
          style={({ pressed }) => [styles.aboutRow, pressed && styles.aboutRowPressed]}>
          <View style={styles.aboutLink}>
            <Ionicons name="logo-github" size={17} color={colors.primary} />
            <AppText variant="caption" style={styles.aboutLinkText}>
              github.com/hzabbas/DARINO
            </AppText>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textFaint} />
        </Pressable>
      </Card>

      <View style={styles.note}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
        <AppText variant="caption" style={styles.noteText}>
          همه‌ی اطلاعات فقط روی همین گوشی ذخیره می‌شود. فایل پشتیبان شامل تمام دسته‌بندی‌ها و
          تراکنش‌هاست؛ آن را در جای امن نگه دار.
        </AppText>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headerTexts: {
      flexShrink: 1,
    },
    headerSubtitle: {
      marginTop: 2,
      color: colors.textMuted,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    appIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    summaryTexts: {
      flex: 1,
      gap: 2,
    },
    summaryMeta: {
      color: colors.textMuted,
    },
    sectionTitle: {
      marginTop: spacing.xs,
    },
    themeCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.sm,
    },
    themeOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    themeOptionActive: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    themeLabel: {
      color: colors.textMuted,
    },
    themeLabelActive: {
      color: colors.primary,
    },
    goalCard: {
      gap: spacing.md,
    },
    voiceCard: {
      gap: spacing.sm,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    switchTexts: {
      flex: 1,
      gap: 2,
    },
    mutedText: {
      color: colors.textMuted,
      lineHeight: 18,
    },
    voiceBlock: {
      gap: spacing.sm,
    },
    genderRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    genderOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    genderOptionActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    genderLabel: {
      color: colors.textMuted,
    },
    genderLabelActive: {
      color: colors.primary,
    },
    voiceTestButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
    },
    voiceTestBusy: {
      opacity: 0.75,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
    },
    savePressed: {
      opacity: 0.85,
    },
    saveText: {
      color: colors.white,
    },
    goalHint: {
      color: colors.textFaint,
    },
    actionsCard: {
      padding: 0,
      overflow: 'hidden',
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
    },
    actionPressed: {
      backgroundColor: colors.overlay,
    },
    actionIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    actionTexts: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    actionSubtitle: {
      color: colors.textMuted,
      lineHeight: 18,
      fontFamily: fonts.regular,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: spacing.lg,
    },
    /** کارت ریست: پس‌زمینه و حاشیه‌ی قرمز تا از کارت‌های معمولی جدا دیده شود */
    dangerCard: {
      padding: 0,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.expense,
    },
    dangerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.expenseSoft,
    },
    dangerHeaderText: {
      flex: 1,
      color: colors.expense,
      lineHeight: 18,
    },
    aboutCard: {
      gap: spacing.xs,
    },
    aboutHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    aboutSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    aboutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    aboutRowPressed: {
      opacity: 0.6,
    },
    aboutLabel: {
      color: colors.textMuted,
    },
    aboutLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    aboutLinkText: {
      color: colors.primary,
      fontFamily: fonts.medium,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    noteText: {
      flex: 1,
      color: colors.primary,
      lineHeight: 20,
    },
  });
