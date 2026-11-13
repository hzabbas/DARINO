import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useDatabase } from '../db/DatabaseProvider';
import { getCategoryUsageCounts, listCategories } from '../db/categories';
import { createTransaction, updateTransaction } from '../db/transactions';
import { useDbQuery } from '../hooks/useDbQuery';
import { useScreenFocusScroll } from '../hooks/useFocusScroll';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Transaction, TransactionType } from '../types/models';
import { evaluateAmountExpression } from '../utils/amountExpression';
import { directionForInput } from '../utils/bidi';
import { formatAmount } from '../utils/currency';
import { toLatinDigits, toPersianDigits } from '../utils/digits';
import { toPersianErrorMessage } from '../utils/errors';
import { formatJalaliDate, formatShamsiShort, toLocalIso } from '../utils/jalali';
import { formatAmountInWords } from '../utils/numberToWords';
import { AppText } from './AppText';
import { Card } from './Card';
import { JalaliDatePicker } from './JalaliDatePicker';
import { CategorySheet } from './CategorySheet';
import { PrimaryButton } from './PrimaryButton';
import { TypeSwitch } from './TypeSwitch';

interface TransactionFormProps {
  mode: 'create' | 'edit';
  /** در حالت ویرایش، تراکنش فعلی */
  transaction?: Transaction;
  onSaved: () => void;
}

const QUICK_ADD = [
  { amount: 50_000, label: '+۵۰ هزار' },
  { amount: 100_000, label: '+۱۰۰ هزار' },
  { amount: 500_000, label: '+۵۰۰ هزار' },
  { amount: 1_000_000, label: '+۱ میلیون' },
];

function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/**
 * فرم مشترک ثبت و ویرایش تراکنش:
 * نوع، مبلغ با ماشین‌حساب، الگوهای سریع، دسته‌بندی، تاریخ شمسی و توضیحات.
 */
export function TransactionForm({ mode, transaction, onSaved }: TransactionFormProps) {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // اسکرول صفحه‌ی والد (Screen) برای آوردن فیلدهای پایین بالای کیبورد
  const screenScroll = useScreenFocusScroll();

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amountInput, setAmountInput] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.category_id ?? null);
  const [note, setNote] = useState(transaction?.note ?? '');
  const [date, setDate] = useState<Date>(() =>
    transaction ? new Date(transaction.date) : new Date(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isCategorySheetOpen, setCategorySheetOpen] = useState(false);

  const { data: categories, reload: reloadCategories } = useDbQuery(
    (db) => listCategories(db, type),
    [type],
  );
  const { data: usage } = useDbQuery((db) => getCategoryUsageCounts(db), []);

  const parsed = evaluateAmountExpression(amountInput);
  const amount = parsed.value;
  const visibleCategories = (categories ?? []).filter((category) => category.type === type);

  // «ثبت سریع»: پرکاربردترین دسته‌ها؛ اگر تاریخچه‌ای نبود، اولین دسته‌های همان نوع
  const presets = useMemo(() => {
    const list = visibleCategories;
    const counts = usage ?? {};
    const used = list
      .filter((category) => (counts[category.id] ?? 0) > 0)
      .sort((first, second) => (counts[second.id] ?? 0) - (counts[first.id] ?? 0));
    return (used.length > 0 ? used : list).slice(0, 4);
  }, [visibleCategories, usage]);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategoryId(null);
    setError(null);
  };

  const handleAmountChange = (text: string) => {
    // فقط ارقام و عملگرهای مجاز؛ معادل فارسی/عربی قبل از ذخیره لاتین می‌شود
    const next = toLatinDigits(text)
      .replace(/[^0-9+-]/g, '')
      .slice(0, 24);
    setAmountInput(next);
    setError(null);
  };

  const handleQuickAdd = (delta: number) => {
    setAmountInput((current) => {
      if (!current || /[+-]$/.test(current)) {
        return `${current}${delta}`;
      }
      return `${current}+${delta}`;
    });
    setError(null);
  };

  const handleSubmit = () => {
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (amount <= 0) {
      setError('مبلغ تراکنش را وارد کن');
      return;
    }
    if (!categoryId) {
      setError('یک دسته‌بندی انتخاب کن');
      return;
    }

    try {
      const payload = {
        amount,
        type,
        category_id: categoryId,
        date: toLocalIso(date),
        shamsi_date: formatShamsiShort(date),
        note,
      };

      if (mode === 'edit' && transaction) {
        updateTransaction(database, transaction.id, payload);
      } else {
        createTransaction(database, payload);
      }
      onSaved();
    } catch (submitError) {
      setError(toPersianErrorMessage(submitError, 'ذخیره‌ی تراکنش ناموفق بود'));
    }
  };

  const canSubmit = amount > 0 && categoryId !== null && !parsed.error;
  const accentColor = type === 'income' ? colors.income : colors.expense;
  const displayValue = parsed.isExpression
    ? toPersianDigits(amountInput)
    : amount > 0
      ? formatAmount(amount)
      : '';

  return (
    <>
      <TypeSwitch value={type} onChange={handleTypeChange} />

      {mode === 'create' && presets.length > 0 ? (
        <View style={styles.presets}>
          <AppText variant="caption" style={styles.presetsLabel}>
            ثبت سریع
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
            {presets.map((preset) => {
              const selected = preset.id === categoryId;
              return (
                <Pressable
                  key={preset.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setType(preset.type);
                    setCategoryId(preset.id);
                    setError(null);
                  }}
                  style={[
                    styles.presetChip,
                    selected && { borderColor: preset.color, backgroundColor: `${preset.color}14` },
                  ]}>
                  <Ionicons
                    name={preset.icon as keyof typeof Ionicons.glyphMap}
                    size={13}
                    color={preset.color}
                  />
                  <AppText variant="caption" style={[styles.presetText, selected && { color: preset.color }]}>
                    {preset.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <Card style={styles.amountCard}>
        <AppText variant="caption" style={styles.amountLabel}>
          مبلغ (تومان)
        </AppText>
        <TextInput
          value={displayValue}
          onChangeText={handleAmountChange}
          onFocus={() => screenScroll?.onFocus()}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="۰"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={[styles.amountInput, { writingDirection: directionForInput(amountInput, '0') }]}
          accessibilityLabel="مبلغ تراکنش به تومان"
        />

        {amount > 0 ? (
          <AppText variant="caption" style={styles.amountWords} numberOfLines={2}>
            {formatAmountInWords(amount)}
          </AppText>
        ) : null}

        {parsed.isExpression && !parsed.error ? (
          <View style={styles.resultPill}>
            <Ionicons name="calculator-outline" size={13} color={colors.primary} />
            <AppText variant="caption" style={styles.resultText}>
              {`= ${formatAmount(amount)} تومان`}
            </AppText>
          </View>
        ) : null}

        <View style={styles.quickAddRow}>
          {QUICK_ADD.map((item) => (
            <Pressable
              key={item.amount}
              accessibilityRole="button"
              onPress={() => handleQuickAdd(item.amount)}
              style={({ pressed }) => [styles.quickAddChip, pressed && styles.quickAddPressed]}>
              <AppText variant="caption" style={styles.quickAddText}>
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.sectionTitleRow}>
        <AppText variant="subtitle">دسته‌بندی</AppText>
        <AppText variant="caption" style={styles.sectionCount}>
          {categories ? `${toPersianDigits(visibleCategories.length)} مورد` : ''}
        </AppText>
      </View>

      <View style={styles.grid}>
        {visibleCategories.map((category) => {
          const selected = category.id === categoryId;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setCategoryId(category.id);
                setError(null);
              }}
              style={[
                styles.tile,
                selected && {
                  borderColor: category.color,
                  backgroundColor: `${category.color}14`,
                },
              ]}>
              <View style={[styles.tileIcon, { backgroundColor: `${category.color}1F` }]}>
                <Ionicons
                  name={category.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={category.color}
                />
              </View>
              <AppText
                variant="caption"
                numberOfLines={2}
                style={[styles.tileLabel, selected && { color: category.color }]}>
                {category.name}
              </AppText>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="افزودن دسته‌بندی جدید"
          onPress={() => setCategorySheetOpen(true)}
          style={[styles.tile, styles.addTile]}>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </View>
          <AppText variant="caption" numberOfLines={2} style={styles.addLabel}>
            افزودن دسته‌بندی جدید
          </AppText>
        </Pressable>
      </View>

      <Card style={styles.dateCard}>
        <View style={styles.dateHeader}>
          <AppText variant="subtitle">تاریخ</AppText>
          <AppText variant="label" style={styles.dateValue}>
            {formatJalaliDate(date, { withWeekday: true })}
          </AppText>
        </View>

        <View style={styles.dateActions}>
          <Pressable
            onPress={() => setDate(new Date())}
            style={[styles.quickChip, isSameDay(date, today) && styles.quickChipActive]}>
            <AppText
              variant="caption"
              style={[styles.quickChipText, isSameDay(date, today) && styles.quickChipTextActive]}>
              امروز
            </AppText>
          </Pressable>

          <Pressable
            onPress={() => {
              const picked = new Date();
              picked.setDate(picked.getDate() - 1);
              setDate(picked);
            }}
            style={[styles.quickChip, isSameDay(date, yesterday) && styles.quickChipActive]}>
            <AppText
              variant="caption"
              style={[
                styles.quickChipText,
                isSameDay(date, yesterday) && styles.quickChipTextActive,
              ]}>
              دیروز
            </AppText>
          </Pressable>

          <Pressable onPress={() => setPickerOpen(true)} style={styles.calendarButton}>
            <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" style={styles.calendarText}>
              انتخاب تاریخ
            </AppText>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.noteCard}>
        <AppText variant="caption">توضیحات (اختیاری)</AppText>
        <TextInput
          value={note}
          onChangeText={setNote}
          onFocus={() => screenScroll?.onFocus()}
          placeholder="مثلاً کارکرد شیفت صبح اسنپ"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={styles.noteInput}
          multiline
        />
      </Card>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.expense} />
          <AppText variant="caption" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      <PrimaryButton
        label={mode === 'edit' ? 'ذخیره تغییرات' : type === 'income' ? 'ثبت درآمد' : 'ثبت هزینه'}
        icon="checkmark-circle-outline"
        backgroundColor={accentColor}
        onPress={handleSubmit}
        disabled={!canSubmit}
      />

      <JalaliDatePicker
        visible={isPickerOpen}
        value={date}
        maxDate={new Date()}
        onClose={() => setPickerOpen(false)}
        onSelect={setDate}
      />

      <CategorySheet
        visible={isCategorySheetOpen}
        initialType={type}
        onClose={() => setCategorySheetOpen(false)}
        onSaved={(createdId) => {
          setCategoryId(createdId);
          setError(null);
          reloadCategories();
        }}
      />
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    presets: {
      gap: spacing.xs,
    },
    presetsLabel: {
      color: colors.textMuted,
    },
    presetsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: 2,
    },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    presetText: {
      color: colors.textMuted,
    },
    amountCard: {
      alignItems: 'stretch',
      gap: spacing.xs,
    },
    amountLabel: {
      textAlign: 'center',
    },
    amountInput: {
      fontFamily: fonts.bold,
      fontWeight: 'normal',
      fontSize: 32,
      lineHeight: 44,
      color: colors.text,
      textAlign: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    amountWords: {
      textAlign: 'center',
      color: colors.textMuted,
    },
    resultPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 3,
    },
    resultText: {
      color: colors.primary,
    },
    quickAddRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    quickAddChip: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
    },
    quickAddPressed: {
      opacity: 0.6,
    },
    quickAddText: {
      color: colors.textMuted,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionCount: {
      color: colors.textFaint,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: -spacing.sm,
    },
    tile: {
      flexBasis: '30%',
      flexGrow: 1,
      maxWidth: '32%',
      minHeight: 88,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.xs + 2,
      gap: spacing.xs + 2,
    },
    tileIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: {
      textAlign: 'center',
      color: colors.text,
    },
    addTile: {
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    addIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    addLabel: {
      textAlign: 'center',
      color: colors.primary,
    },
    dateCard: {
      gap: spacing.md,
    },
    dateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    dateValue: {
      color: colors.text,
    },
    dateActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    quickChip: {
      height: 34,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    quickChipText: {
      color: colors.textMuted,
    },
    quickChipTextActive: {
      color: colors.primary,
      fontFamily: fonts.medium,
    },
    calendarButton: {
      flex: 1,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    calendarText: {
      color: colors.textMuted,
    },
    noteCard: {
      gap: spacing.xs,
    },
    noteInput: {
      fontFamily: fonts.regular,
      fontWeight: 'normal',
      fontSize: 14,
      lineHeight: 22,
      color: colors.text,
      textAlign: 'right',
      writingDirection: 'rtl',
      minHeight: 42,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.expenseSoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    errorText: {
      color: colors.expense,
      flexShrink: 1,
    },
  });
