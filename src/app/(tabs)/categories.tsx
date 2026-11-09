import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { CategoryDeleteSheet } from '../../components/CategoryDeleteSheet';
import { CategoryIcon } from '../../components/CategoryIcon';
import { CategorySheet } from '../../components/CategorySheet';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  deleteCategoryWithTransactions,
  deleteEmptyCategory,
  getCategoryUsageCounts,
  listCategories,
  moveTransactions,
} from '../../db/categories';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, fonts, radius, spacing } from '../../theme';
import type { Category, TransactionType } from '../../types/models';
import { toPersianDigits } from '../../utils/digits';

interface TypeTabProps {
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
  active: boolean;
  onPress: () => void;
}

function TypeTab({ label, count, icon, color, soft, active, onPress }: TypeTabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && { backgroundColor: soft, borderColor: color }]}>
      <Ionicons name={icon} size={17} color={active ? color : colors.textFaint} />
      <AppText variant="label" style={[styles.tabLabel, active && { color }]}>
        {label}
      </AppText>
      <View style={[styles.badge, active && { backgroundColor: color }]}>
        <AppText variant="caption" style={[styles.badgeText, active && styles.badgeTextActive]}>
          {toPersianDigits(count)}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function CategoriesScreen() {
  const database = useDatabase();
  const [activeType, setActiveType] = useState<TransactionType>('expense');
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const { data, reload } = useDbQuery((db) => ({
    categories: listCategories(db),
    usage: getCategoryUsageCounts(db),
  }));

  const categories = data?.categories ?? [];
  const usage = data?.usage ?? {};
  const expenses = categories.filter((category) => category.type === 'expense');
  const incomes = categories.filter((category) => category.type === 'income');
  const visibleCategories = activeType === 'expense' ? expenses : incomes;

  const destinations = deletingCategory
    ? categories.filter(
        (category) => category.type === deletingCategory.type && category.id !== deletingCategory.id,
      )
    : [];

  const openCreate = () => {
    setEditingCategory(null);
    setSheetOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setSheetOpen(true);
  };

  const handleDeleteEmpty = () => {
    if (!deletingCategory) {
      return;
    }
    try {
      deleteEmptyCategory(database, deletingCategory.id);
      setDeletingCategory(null);
      reload();
    } catch (error) {
      Alert.alert('حذف انجام نشد', error instanceof Error ? error.message : 'خطای ناشناخته');
    }
  };

  const handleMoveAndDelete = (targetId: number) => {
    if (!deletingCategory) {
      return;
    }
    try {
      moveTransactions(database, deletingCategory.id, targetId);
      deleteEmptyCategory(database, deletingCategory.id);
      setDeletingCategory(null);
      reload();
    } catch (error) {
      Alert.alert('انتقال انجام نشد', error instanceof Error ? error.message : 'خطای ناشناخته');
    }
  };

  const handleDeleteAll = () => {
    if (!deletingCategory) {
      return;
    }
    try {
      deleteCategoryWithTransactions(database, deletingCategory.id);
      setDeletingCategory(null);
      reload();
    } catch (error) {
      Alert.alert('حذف انجام نشد', error instanceof Error ? error.message : 'خطای ناشناخته');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="دسته‌بندی‌ها"
        subtitle={`${toPersianDigits(categories.length)} دسته‌بندی`}
      />

      <View style={styles.tabs}>
        <TypeTab
          label="هزینه‌ها"
          count={expenses.length}
          icon="arrow-up-circle"
          color={colors.expense}
          soft={colors.expenseSoft}
          active={activeType === 'expense'}
          onPress={() => setActiveType('expense')}
        />
        <TypeTab
          label="درآمدها"
          count={incomes.length}
          icon="arrow-down-circle"
          color={colors.income}
          soft={colors.incomeSoft}
          active={activeType === 'income'}
          onPress={() => setActiveType('income')}
        />
      </View>

      <Pressable onPress={openCreate} style={styles.addButton}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <AppText variant="label" style={styles.addLabel}>
          ایجاد دسته‌بندی جدید
        </AppText>
      </Pressable>

      {visibleCategories.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title={activeType === 'expense' ? 'دسته‌ی هزینه‌ای نداری' : 'دسته‌ی درآمدی نداری'}
          message="یک دسته‌بندی جدید بساز تا بتوانی تراکنش‌هایت را دسته‌بندی کنی."
          actionLabel="ایجاد دسته‌بندی"
          onActionPress={openCreate}
        />
      ) : (
        <View style={styles.list}>
          {visibleCategories.map((category) => {
            const count = usage[category.id] ?? 0;
            return (
              <View key={category.id} style={styles.row}>
                <CategoryIcon icon={category.icon} color={category.color} size={40} />

                <View style={styles.rowTexts}>
                  <AppText variant="label" numberOfLines={1}>
                    {category.name}
                  </AppText>
                  <AppText variant="caption" style={styles.rowMeta}>
                    {count > 0 ? `${toPersianDigits(count)} تراکنش` : 'بدون تراکنش'}
                  </AppText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`ویرایش ${category.name}`}
                  hitSlop={6}
                  onPress={() => openEdit(category)}
                  style={styles.actionButton}>
                  <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`حذف ${category.name}`}
                  hitSlop={6}
                  onPress={() => setDeletingCategory(category)}
                  style={[styles.actionButton, styles.deleteButton]}>
                  <Ionicons name="trash-outline" size={15} color={colors.expense} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <AppText variant="caption" style={styles.hintText}>
          با ویرایش نام یا رنگ یک دسته‌بندی، همان تغییر در همه‌ی تراکنش‌های قبلی هم دیده
          می‌شود. حذف دسته‌بندی بدون تعیین تکلیف تراکنش‌هایش انجام نمی‌شود.
        </AppText>
      </View>

      <CategorySheet
        visible={isSheetOpen}
        category={editingCategory}
        initialType={activeType}
        allowTypeSelection={editingCategory === null}
        onClose={() => setSheetOpen(false)}
        onSaved={() => reload()}
      />

      <CategoryDeleteSheet
        visible={deletingCategory !== null}
        category={deletingCategory}
        transactionCount={deletingCategory ? (usage[deletingCategory.id] ?? 0) : 0}
        destinations={destinations}
        onClose={() => setDeletingCategory(null)}
        onDeleteEmpty={handleDeleteEmpty}
        onMoveAndDelete={handleMoveAndDelete}
        onDeleteAll={handleDeleteAll}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  tabLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  badge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: {
    color: colors.textMuted,
  },
  badgeTextActive: {
    color: colors.white,
  },
  addButton: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  addLabel: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 1,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowMeta: {
    color: colors.textMuted,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  deleteButton: {
    backgroundColor: colors.expenseSoft,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: {
    flex: 1,
    color: colors.primaryDark,
    lineHeight: 20,
  },
});
