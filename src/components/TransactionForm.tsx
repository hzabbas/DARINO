import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useDatabase } from '../db/DatabaseProvider';
import { listCategories } from '../db/categories';
import { createTransaction, updateTransaction } from '../db/transactions';
import { useDbQuery } from '../hooks/useDbQuery';
import { colors, fonts, radius, spacing } from '../theme';
import type { Transaction, TransactionType } from '../types/models';
import { formatAmount, parseAmount } from '../utils/currency';
import { onlyDigits, toPersianDigits } from '../utils/digits';
import { formatJalaliDate, formatShamsiShort, toLocalIso } from '../utils/jalali';
import { formatAmountInWords } from '../utils/numberToWords';
import { AppText } from './AppText';
import { Card } from './Card';
import { JalaliDatePicker } from './JalaliDatePicker';
import { NewCategorySheet } from './NewCategorySheet';
import { PrimaryButton } from './PrimaryButton';
import { TypeSwitch } from './TypeSwitch';

interface TransactionFormProps {
  mode: 'create' | 'edit';
  /** در حالت ویرایش، تراکنش فعلی */
  transaction?: Transaction;
  onSaved: () => void;
}

function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/**
 * فرم مشترک ثبت و ویرایش تراکنش:
 * نوع، مبلغ با معادل حروفی، دسته‌بندی (با ساخت سریع)، تاریخ شمسی و توضیحات.
 */
export function TransactionForm({ mode, transaction, onSaved }: TransactionFormProps) {
  const database = useDatabase();
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
  const amount = parseAmount(amountInput);
  // فیلتر دوباره‌ی نوع، تا در لحظه‌ی تغییر سوییچ هم دسته‌ی اشتباه دیده نشود
  const visibleCategories = (categories ?? []).filter((category) => category.type === type);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategoryId(null);
    setError(null);
  };

  const handleSubmit = () => {
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
      setError(submitError instanceof Error ? submitError.message : 'ذخیره‌ی تراکنش ناموفق بود');
    }
  };

  const canSubmit = amount > 0 && categoryId !== null;
  const accentColor = type === 'income' ? colors.income : colors.expense;

  return (
    <>
      <TypeSwitch value={type} onChange={handleTypeChange} />

      <Card style={styles.amountCard}>
        <AppText variant="caption" style={styles.amountLabel}>
          مبلغ (تومان)
        </AppText>
        <TextInput
          value={amountInput ? formatAmount(amount) : ''}
          onChangeText={(text) => {
            setAmountInput(onlyDigits(text).slice(0, 12));
            setError(null);
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="۰"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={styles.amountInput}
          accessibilityLabel="مبلغ تراکنش به تومان"
        />
        {amount > 0 ? (
          <AppText variant="caption" style={styles.amountWords} numberOfLines={2}>
            {formatAmountInWords(amount)}
          </AppText>
        ) : null}
      </Card>

      <View style={styles.sectionTitleRow}>
        <AppText variant="subtitle">دسته‌بندی</AppText>
        <AppText variant="caption">
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

      <NewCategorySheet
        visible={isCategorySheetOpen}
        type={type}
        onClose={() => setCategorySheetOpen(false)}
        onCreated={(createdId) => {
          setCategoryId(createdId);
          setError(null);
          reloadCategories();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  amountLabel: {
    textAlign: 'center',
  },
  amountInput: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  amountWords: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    minHeight: 42,
    paddingTop: spacing.xs,
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
