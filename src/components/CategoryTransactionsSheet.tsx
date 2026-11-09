import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../theme';
import type { CategoryTotal, TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { matchesTransactionQuery } from '../utils/transactionSearch';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';
import { SearchBox } from './SearchBox';
import { TransactionRow } from './TransactionRow';

interface CategoryTransactionsSheetProps {
  visible: boolean;
  category: CategoryTotal | null;
  /** همه‌ی تراکنش‌های بازه؛ خودِ شیت بر اساس دسته فیلتر می‌کند */
  transactions: TransactionWithCategory[];
  onClose: () => void;
}

/** لیست کامل تراکنش‌های یک دسته‌بندی در بازه‌ی انتخاب‌شده. */
export function CategoryTransactionsSheet({
  visible,
  category,
  transactions,
  onClose,
}: CategoryTransactionsSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
    }
  }, [visible, category]);

  if (!category) {
    return null;
  }

  const categoryTransactions = transactions.filter(
    (transaction) => transaction.category_id === category.category_id,
  );
  const filtered = categoryTransactions.filter((transaction) =>
    matchesTransactionQuery(transaction, query),
  );

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
          <View style={styles.headerRow}>
            <AppText variant="subtitle">تراکنش‌های دسته</AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.categoryCard}>
            <CategoryIcon icon={category.icon} color={category.color} size={40} />
            <View style={styles.categoryTexts}>
              <AppText variant="label" numberOfLines={1}>
                {category.name}
              </AppText>
              <AppText variant="caption" style={styles.categoryMeta}>
                {`${formatAmount(category.total)} تومان · ${toPersianDigits(
                  category.count,
                )} تراکنش`}
              </AppText>
            </View>
          </View>

          <SearchBox value={query} onChange={setQuery} placeholder="جستجو در دسته، توضیحات یا مبلغ…" />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}>
            {filtered.length === 0 ? (
              <AppText variant="caption" style={styles.empty}>
                {categoryTransactions.length === 0
                  ? 'در این بازه تراکنشی برای این دسته ثبت نشده است.'
                  : 'چیزی با این جستجو پیدا نشد.'}
              </AppText>
            ) : (
              filtered.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '88%',
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  categoryTexts: {
    flex: 1,
    gap: 2,
  },
  categoryMeta: {
    color: colors.textMuted,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: spacing.xl,
  },
});
