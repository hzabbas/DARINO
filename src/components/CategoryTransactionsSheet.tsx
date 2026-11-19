import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { CategoryTotal, TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { matchesTransactionQuery } from '../utils/transactionSearch';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';
import { EmptyState } from './EmptyState';
import { SearchBox } from './SearchBox';
import { TransactionRow } from './TransactionRow';

interface CategoryTransactionsSheetProps {
  visible: boolean;
  category: CategoryTotal | null;
  /** All transactions in period; filtered by category inside sheet. */
  transactions: TransactionWithCategory[];
  onClose: () => void;
}

/** Full transaction list for selected category. */
export function CategoryTransactionsSheet({
  visible,
  category,
  transactions,
  onClose,
}: CategoryTransactionsSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
    }
  }, [visible, category]);

  // Filter transactions by selected category.
  const categoryTransactions = useMemo(
    () =>
      category
        ? transactions.filter((transaction) => transaction.category_id === category.category_id)
        : [],
    [category, transactions],
  );

  const filtered = useMemo(
    () => categoryTransactions.filter((transaction) => matchesTransactionQuery(transaction, query)),
    [categoryTransactions, query],
  );

  const handleSelect = useCallback(
    (item: TransactionWithCategory) => {
      onClose();
      router.push(`/edit/${item.id}`);
    },
    [onClose],
  );

  const renderTransaction = useCallback(
    ({ item }: { item: TransactionWithCategory }) => (
      <TransactionRow transaction={item} onSelect={handleSelect} onEdit={handleSelect} />
    ),
    [handleSelect],
  );

  if (!category) {
    return null;
  }

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
              <AppText variant="caption" style={styles.categoryMeta} numberOfLines={1}>
                {`${formatAmount(category.total)} تومان · ${toPersianDigits(
                  category.count,
                )} تراکنش`}
              </AppText>
            </View>
          </View>

          <SearchBox value={query} onChange={setQuery} placeholder="جستجو در دسته، توضیحات یا مبلغ…" />

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderTransaction}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.listContent}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <EmptyState
                compact
                icon={categoryTransactions.length === 0 ? 'receipt-outline' : 'search-outline'}
                title={
                  categoryTransactions.length === 0
                    ? 'در این بازه تراکنشی برای این دسته ثبت نشده است.'
                    : 'چیزی با این جستجو پیدا نشد.'
                }
              />
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    minWidth: 0,
    gap: 2,
  },
  categoryMeta: {
    color: colors.textMuted,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
