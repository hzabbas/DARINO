import { Ionicons } from '@expo/vector-icons';
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
import { EmptyHint } from './EmptyHint';
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
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
    }
  }, [visible, category]);

  // فیلتر فقط وقتی ورودی‌ها عوض شوند اجرا می‌شود، نه در هر رندر شیت
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

  const renderTransaction = useCallback(
    ({ item }: { item: TransactionWithCategory }) => <TransactionRow transaction={item} />,
    [],
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
            // تاریخچه‌ی یک دسته می‌تواند صدها ردیف باشد؛ ردیف‌ها memo شده‌اند و
            // لیست به‌صورت تدریجی رندر می‌شود.
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <EmptyHint
                icon={categoryTransactions.length === 0 ? 'receipt-outline' : 'search-outline'}
                text={
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
    // شیت ارتفاع محدود دارد؛ لیست باید کوچک شود نه اینکه سرریز کند
    flexShrink: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
