import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useDatabase } from '../db/DatabaseProvider';
import { backupToJson, buildBackupFileName, restoreBackup } from '../db/backup';
import { countCategories } from '../db/categories';
import { getNumericSetting, setSetting } from '../db/settings';
import { countTransactions, listTransactions } from '../db/transactions';
import { useDbQuery } from '../hooks/useDbQuery';
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

  const [busy, setBusy] = useState<'export' | 'import' | 'csv' | null>(null);
  const [incomeGoalInput, setIncomeGoalInput] = useState(() =>
    String(getNumericSetting(database, 'income_goal') || ''),
  );
  const [budgetInput, setBudgetInput] = useState(() =>
    String(getNumericSetting(database, 'expense_budget') || ''),
  );

  const { data, reload } = useDbQuery((db) => ({
    categories: countCategories(db),
    transactions: countTransactions(db),
  }));

  const categoriesCount = data?.categories ?? 0;
  const transactionsCount = data?.transactions ?? 0;
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
        `${toPersianDigits(result.categories)} دسته‌بندی و ${toPersianDigits(
          result.transactions,
        )} تراکنش بازگردانی شد.`,
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
        هدف درآمد و سقف بودجه
      </AppText>

      <Card style={styles.goalCard}>
        <View style={styles.goalRow}>
          <AppText variant="caption" style={styles.goalLabel}>
            هدف درآمد ماهانه (تومان)
          </AppText>
          <TextInput
            value={incomeGoalInput}
            onChangeText={(text) => setIncomeGoalInput(text.replace(/[^0-9۰-۹٠-٩]/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="مثلاً ۲۰۰۰۰۰۰۰"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            style={styles.goalInput}
          />
        </View>

        <View style={styles.goalRow}>
          <AppText variant="caption" style={styles.goalLabel}>
            سقف بودجه‌ی هزینه ماهانه (تومان)
          </AppText>
          <TextInput
            value={budgetInput}
            onChangeText={(text) => setBudgetInput(text.replace(/[^0-9۰-۹٠-٩]/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="مثلاً ۱۵۰۰۰۰۰۰"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            style={styles.goalInput}
          />
        </View>

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
    goalRow: {
      gap: spacing.xs,
    },
    goalLabel: {
      color: colors.textMuted,
    },
    goalInput: {
      fontFamily: fonts.semibold,
      fontWeight: 'normal',
      fontSize: 16,
      color: colors.text,
      textAlign: 'right',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
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
