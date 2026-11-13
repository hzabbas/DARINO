import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDatabase } from '../db/DatabaseProvider';
import { approvePendingSms, ignorePendingSms } from '../db/pendingSms';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { BankAccount, Category, PendingSms } from '../types/models';
import { isolateLtr } from '../utils/bidi';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { toPersianErrorMessage } from '../utils/errors';
import { getBank } from '../utils/iranianBanks';
import { formatAmountInWords } from '../utils/numberToWords';
import { AppText } from './AppText';
import { BankLogo } from './BankLogo';

interface PendingSmsGateModalProps {
  visible: boolean;
  items: PendingSms[];
  accounts: BankAccount[];
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}

type Action = 'expense' | 'income' | null;

/**
 * صندوق تایید سریع: قبل از ورود به داشبورد، هر پیامک کشف‌شده را با یک لمس
 * به هزینه/درآمد/انتقال تبدیل می‌کند یا نادیده می‌گیرد.
 */
export function PendingSmsGateModal({
  visible,
  items,
  accounts,
  categories,
  onClose,
  onChanged,
}: PendingSmsGateModalProps) {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [action, setAction] = useState<Action>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setCurrentId(null);
      return;
    }
    if (!items.some((item) => item.id === currentId)) {
      setCurrentId(items[0].id);
      setAction(null);
      setShowRaw(false);
    }
  }, [items, currentId]);

  const current = items.find((item) => item.id === currentId) ?? items[0] ?? null;
  const account = accounts.find((item) => item.id === current?.bank_account_id) ?? null;
  const bank = current ? getBank(account?.bank_code ?? 'other') : null;

  const isTransfer = current?.detected_type === 'transfer';
  const effectiveAction: Action = action ?? (isTransfer ? null : current?.detected_type === 'income' ? 'income' : 'expense');

  // دسته‌بندی پیشنهادی سیستم (بر اساس تاریخچه‌ی همین فروشنده یا کلیدواژه‌ی پیامک)؛
  // فقط وقتی با نوع فعلی (هزینه/درآمد) هم‌خوان باشد پیشنهاد می‌شود.
  const suggestedCategory =
    current?.suggested_category_id && effectiveAction
      ? categories.find(
          (category) =>
            category.id === current.suggested_category_id && category.type === effectiveAction,
        ) ?? null
      : null;

  const options = useMemo(() => {
    const list = categories
      .filter((category) => category.type === (effectiveAction ?? 'expense'))
      .slice(0, 8);

    if (!suggestedCategory) return list;
    return [
      suggestedCategory,
      ...list.filter((category) => category.id !== suggestedCategory.id),
    ].slice(0, 8);
  }, [categories, effectiveAction, suggestedCategory]);

  const next = () => {
    setAction(null);
    setShowRaw(false);
    const remaining = items.filter((item) => item.id !== current?.id);
    if (remaining.length === 0) {
      onClose();
      return;
    }
    setCurrentId(remaining[0].id);
  };

  const approve = (categoryId?: number) => {
    if (!current) return;
    try {
      approvePendingSms(database, { id: current.id, categoryId: categoryId ?? null });
      onChanged();
      next();
    } catch (error) {
      // پیام خطا در UI نشان داده می‌شود
      console.warn(toPersianErrorMessage(error));
    }
  };

  const ignore = () => {
    if (!current) return;
    ignorePendingSms(database, current.id);
    onChanged();
    next();
  };

  if (!current || !bank) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            <AppText variant="title">تایید سریع</AppText>
            <AppText variant="caption" style={styles.muted}>
              {`${toPersianDigits(items.length)} تراکنش خودکار کشف شد`}
            </AppText>
          </View>
          <Pressable onPress={onClose} style={styles.skipButton} accessibilityRole="button">
            <AppText variant="caption" style={styles.skipText}>
              رد کردن و ورود
            </AppText>
            <Ionicons name="arrow-back" size={14} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.bankRow}>
              <BankLogo code={bank.code} size={46} />
              <View style={styles.bankTexts}>
                <AppText variant="label">{account?.title ?? bank.name}</AppText>
                <AppText variant="caption" style={styles.muted}>
                  {`${bank.name} · ${isolateLtr(current.sender)}`}
                </AppText>
              </View>
              <View
                style={[
                  styles.typePill,
                  {
                    backgroundColor:
                      current.detected_type === 'income'
                        ? colors.incomeSoft
                        : current.detected_type === 'transfer'
                          ? `${colors.primary}1A`
                          : colors.expenseSoft,
                  },
                ]}>
                <AppText
                  variant="caption"
                  style={{
                    color:
                      current.detected_type === 'income'
                        ? colors.income
                        : current.detected_type === 'transfer'
                          ? colors.primary
                          : colors.expense,
                  }}>
                  {current.detected_type === 'income'
                    ? 'واریز'
                    : current.detected_type === 'transfer'
                      ? 'انتقال'
                      : 'برداشت'}
                </AppText>
              </View>
            </View>

            <AppText variant="display" style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
              {`${current.detected_type === 'income' ? '+' : current.detected_type === 'transfer' ? '' : '−'}${formatAmount(current.amount)}`}
            </AppText>
            {/* عدد با حروف، تا کاربر قبل از تایید مطمئن شود تعداد صفرها درست است */}
            <AppText variant="caption" style={styles.amountWords} numberOfLines={2}>
              {formatAmountInWords(current.amount)}
            </AppText>
            <AppText variant="caption" style={styles.muted}>
              {`تومان · ${current.shamsi_date} ${current.time ?? ''}`}
            </AppText>

            {current.merchant ? (
              <View style={styles.merchantRow}>
                <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
                <AppText variant="caption" style={styles.muted} numberOfLines={1}>
                  {`فروشنده: ${current.merchant}`}
                </AppText>
              </View>
            ) : null}

            {current.detected_balance !== null ? (
              <View style={styles.balanceRow}>
                <Ionicons name="card-outline" size={14} color={colors.textMuted} />
                <AppText variant="caption" style={styles.muted}>
                  {`موجودی جدید بانک: ${formatAmount(current.detected_balance)} تومان`}
                </AppText>
              </View>
            ) : null}

            {current.roundup_amount > 0 ? (
              <AppText variant="caption" style={styles.muted}>
                {`رند بلوبانک: ${formatAmount(current.roundup_amount)} تومان`}
              </AppText>
            ) : null}

            {current.detected_type === 'transfer' ? (
              <View style={styles.transferBox}>
                <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
                <AppText variant="caption" style={styles.transferText}>
                  {current.fee_amount > 0
                    ? `انتقال بین حساب‌های خودت؛ کارمزد ${formatAmount(current.fee_amount)} تومان`
                    : 'انتقال بین حساب‌های خودت؛ بدون کارمزد'}
                </AppText>
              </View>
            ) : null}

            <Pressable onPress={() => setShowRaw((value) => !value)} style={styles.rawToggle}>
              <Ionicons name={showRaw ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              <AppText variant="caption" style={styles.muted}>
                متن اصلی پیامک
              </AppText>
            </Pressable>
            {showRaw ? (
              <View style={styles.rawBox}>
                <AppText variant="caption" style={styles.rawText}>
                  {current.raw_body}
                </AppText>
              </View>
            ) : null}
          </View>

          {current.detected_type === 'transfer' ? (
            <Pressable onPress={() => approve()} style={styles.primaryButton}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
              <AppText variant="caption" style={styles.primaryText}>
                ثبت انتقال (بدون تاثیر در دخل‌وخرج)
              </AppText>
            </Pressable>
          ) : (
            <>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => setAction('expense')}
                  style={[styles.actionChip, effectiveAction === 'expense' && styles.actionChipActiveExpense]}>
                  <Ionicons name="arrow-up-circle-outline" size={16} color={colors.expense} />
                  <AppText variant="caption" style={{ color: colors.expense }}>
                    هزینه
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => setAction('income')}
                  style={[styles.actionChip, effectiveAction === 'income' && styles.actionChipActiveIncome]}>
                  <Ionicons name="arrow-down-circle-outline" size={16} color={colors.income} />
                  <AppText variant="caption" style={{ color: colors.income }}>
                    درآمد
                  </AppText>
                </Pressable>
              </View>

              <AppText variant="caption" style={styles.muted}>
                دسته‌بندی را انتخاب کن:
              </AppText>

              {suggestedCategory ? (
                <View style={styles.suggestionBox}>
                  <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
                  <AppText variant="caption" style={styles.suggestionText} numberOfLines={2}>
                    {`پیشنهاد سیستم: «${suggestedCategory.name}»`}
                    {current.merchant ? ' — بر اساس تراکنش‌های قبلی همین فروشنده' : ''}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.categoryGrid}>
                {options.map((category) => {
                  const isSuggested = category.id === suggestedCategory?.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => approve(category.id)}
                      style={[
                        styles.categoryChip,
                        { borderColor: `${category.color}55` },
                        isSuggested && styles.categoryChipSuggested,
                      ]}>
                      <View style={[styles.categoryDot, { backgroundColor: `${category.color}22` }]}>
                        <Ionicons
                          name={category.icon as keyof typeof Ionicons.glyphMap}
                          size={13}
                          color={category.color}
                        />
                      </View>
                      <AppText variant="caption" numberOfLines={1} style={styles.categoryText}>
                        {category.name}
                      </AppText>
                      {isSuggested ? (
                        <AppText variant="caption" style={styles.suggestedBadge}>
                          پیشنهاد
                        </AppText>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {suggestedCategory ? (
            <Pressable onPress={() => approve(suggestedCategory.id)} style={styles.primaryButton}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
              <AppText variant="caption" style={styles.primaryText} numberOfLines={1}>
                {`تایید و ثبت در «${suggestedCategory.name}»`}
              </AppText>
            </Pressable>
          ) : null}

          <Pressable onPress={ignore} style={styles.ignoreButton}>
            <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" style={styles.muted}>
              نادیده گرفتن این پیامک
            </AppText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerTexts: { gap: 2 },
    muted: { color: colors.textMuted },
    skipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    skipText: { color: colors.primary },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    bankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bankTexts: { flex: 1, gap: 1 },
    typePill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    amount: { marginTop: spacing.xs },
    amountWords: { color: colors.textMuted, lineHeight: 18 },
    merchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    suggestionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      marginTop: spacing.xs,
    },
    suggestionText: { flex: 1, color: colors.primary, lineHeight: 18 },
    categoryChipSuggested: { backgroundColor: colors.primarySoft },
    suggestedBadge: {
      color: colors.primary,
      fontSize: 10,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
    },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    transferBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginTop: spacing.xs,
    },
    transferText: { flex: 1, color: colors.primary },
    rawToggle: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: spacing.xs },
    rawBox: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
    },
    rawText: { color: colors.textMuted, lineHeight: 20 },
    actionsRow: { flexDirection: 'row', gap: spacing.sm },
    actionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionChipActiveExpense: { borderColor: colors.expense, backgroundColor: colors.expenseSoft },
    actionChipActiveIncome: { borderColor: colors.income, backgroundColor: colors.incomeSoft },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: radius.pill,
      borderWidth: 1,
      backgroundColor: colors.surface,
      maxWidth: '48%',
    },
    categoryDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryText: { color: colors.text },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    primaryText: { color: colors.white },
    ignoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
  });
