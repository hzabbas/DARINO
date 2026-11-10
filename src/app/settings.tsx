import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useDatabase } from '../db/DatabaseProvider';
import { backupToJson, buildBackupFileName, restoreBackup } from '../db/backup';
import { countCategories } from '../db/categories';
import { countTransactions } from '../db/transactions';
import { useDbQuery } from '../hooks/useDbQuery';
import { colors, fonts, radius, spacing } from '../theme';
import { toPersianDigits } from '../utils/digits';
import { confirmAction, notify } from '../utils/dialogs';
import { toPersianErrorMessage } from '../utils/errors';

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
}

function ActionRow({ icon, title, subtitle, onPress, busy = false }: ActionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
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

export default function SettingsScreen() {
  const database = useDatabase();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const { data, reload } = useDbQuery((db) => ({
    categories: countCategories(db),
    transactions: countTransactions(db),
  }));

  const categoriesCount = data?.categories ?? 0;
  const transactionsCount = data?.transactions ?? 0;
  const version = Constants.expoConfig?.version ?? '1.0.0';

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

  const handleExport = async () => {
    if (busy) {
      return;
    }
    setBusy('export');

    try {
      const json = backupToJson(database);
      const fileName = buildBackupFileName();

      // روی وب، فایل مستقیم از مرورگر دانلود می‌شود
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }

      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      file.writeSync(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'پشتیبان دارینو',
          UTI: 'public.json',
        });
      } else {
        notify('اشتراک‌گذاری در دسترس نیست', `فایل پشتیبان ذخیره شد:\n${file.uri}`);
      }
    } catch (error) {
      notify('پشتیبان‌گیری انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async (uri: string) => {
    setBusy('import');
    try {
      const content =
        Platform.OS === 'web'
          ? await (await fetch(uri)).text()
          : await new File(uri).text();

      const result = restoreBackup(database, content);
      reload();
      notify(
        'بازیابی کامل شد',
        `${toPersianDigits(result.categories)} دسته‌بندی و ${toPersianDigits(
          result.transactions,
        )} تراکنش بازیابی شد.`,
      );
    } catch (error) {
      notify('بازیابی انجام نشد', toPersianErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (busy) {
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      confirmAction({
        title: 'بازیابی پشتیبان',
        message:
          'همه‌ی دسته‌بندی‌ها و تراکنش‌های فعلی پاک و با محتوای این فایل جایگزین می‌شوند. ادامه می‌دهی؟',
        confirmLabel: 'بازیابی',
        destructive: true,
        onConfirm: () => {
          void runRestore(asset.uri);
        },
      });
    } catch (error) {
      notify('انتخاب فایل ناموفق بود', toPersianErrorMessage(error));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <AppText variant="title">تنظیمات</AppText>
          <AppText variant="caption" style={styles.headerSubtitle}>
            پشتیبان‌گیری، بازیابی و اطلاعات برنامه
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
        <AppText variant="caption" style={styles.version}>
          {`نسخه ${toPersianDigits(version)}`}
        </AppText>
      </Card>

      <AppText variant="subtitle" style={styles.sectionTitle}>
        پشتیبان‌گیری و بازیابی
      </AppText>

      <Card style={styles.actionsCard}>
        <ActionRow
          icon="share-outline"
          title="ساخت فایل پشتیبان"
          subtitle="ذخیره یا ارسال فایل JSON در تلگرام، فایل منیجر و …"
          onPress={handleExport}
          busy={busy === 'export'}
        />
        <View style={styles.separator} />
        <ActionRow
          icon="folder-open-outline"
          title="بازیابی از فایل پشتیبان"
          subtitle="انتخاب فایل JSON و جایگزینی همه‌ی اطلاعات فعلی"
          onPress={handleImport}
          busy={busy === 'import'}
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

const styles = StyleSheet.create({
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
  version: {
    color: colors.textFaint,
  },
  sectionTitle: {
    marginTop: spacing.xs,
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
    backgroundColor: colors.background,
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
    color: colors.primaryDark,
    lineHeight: 20,
  },
});
