import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useDatabase } from '../../db/DatabaseProvider';
import { listCategories } from '../../db/categories';
import { createTransaction } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, fonts, radius, spacing } from '../../theme';
import type { TransactionType } from '../../types/models';
import { formatAmount, parseAmount } from '../../utils/currency';
import { onlyDigits, toPersianDigits } from '../../utils/digits';
import { formatJalaliDate, formatShamsiShort, toLocalIso } from '../../utils/jalali';

const TYPE_OPTIONS = [
  { value: 'expense' as TransactionType, label: 'هزینه', icon: 'arrow-up-circle-outline' as const },
  { value: 'income' as TransactionType, label: 'درآمد', icon: 'arrow-down-circle-outline' as const },
];

export default function AddTransactionScreen() {
  const database = useDatabase();
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useDbQuery((db) => listCategories(db, type), [type]);
  const amount = parseAmount(amountInput);

  useEffect(() => {
    setCategoryId(null);
    setError(null);
  }, [type]);

  const handleSubmit = () => {
    if (amount <= 0) {
      setError('مبلغ تراکنش را وارد کن');
      return;
    }
    if (!categoryId) {
      setError('یک دسته‌بندی انتخاب کن');
      return;
    }

    const now = new Date();
    try {
      createTransaction(database, {
        amount,
        type,
        category_id: categoryId,
        date: toLocalIso(now),
        shamsi_date: formatShamsiShort(now),
        note,
      });

      setAmountInput('');
      setNote('');
      setCategoryId(null);
      setError(null);
      router.navigate('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'ثبت تراکنش ناموفق بود');
    }
  };

  const canSubmit = amount > 0 && categoryId !== null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <ScreenHeader title="ثبت تراکنش" subtitle="نوع، مبلغ و دسته‌بندی را مشخص کن" />

        <SegmentedControl value={type} options={TYPE_OPTIONS} onChange={setType} />

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
        </Card>

        <View style={styles.sectionTitleRow}>
          <AppText variant="subtitle">دسته‌بندی</AppText>
          <AppText variant="caption">
            {categories ? `${toPersianDigits(categories.length)} مورد` : ''}
          </AppText>
        </View>

        <View style={styles.chips}>
          {(categories ?? []).map((category) => {
            const selected = category.id === categoryId;
            return (
              <Pressable
                key={category.id}
                onPress={() => {
                  setCategoryId(category.id);
                  setError(null);
                }}
                style={[
                  styles.chip,
                  selected && {
                    borderColor: category.color,
                    backgroundColor: `${category.color}14`,
                  },
                ]}>
                <Ionicons
                  name={category.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={selected ? category.color : colors.textMuted}
                />
                <AppText
                  variant="label"
                  numberOfLines={1}
                  style={[styles.chipLabel, selected && { color: category.color }]}>
                  {category.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.noteCard}>
          <AppText variant="caption">توضیحات (اختیاری)</AppText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="مثلاً بنزین مسیر کرمان"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            style={styles.noteInput}
            multiline
          />
        </Card>

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          <AppText variant="label" style={styles.dateText}>
            امروز، {formatJalaliDate(new Date(), { withWeekday: true })}
          </AppText>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.expense} />
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          </View>
        ) : null}

        <PrimaryButton
          label="ثبت تراکنش"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          disabled={!canSubmit}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: -spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  chipLabel: {
    flexShrink: 1,
    color: colors.text,
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dateText: {
    color: colors.textMuted,
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
