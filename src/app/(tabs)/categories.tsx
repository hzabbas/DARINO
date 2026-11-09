import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { listCategories, getCategoryUsageCounts } from '../../db/categories';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, radius, spacing } from '../../theme';
import type { Category, TransactionType } from '../../types/models';
import { toPersianDigits } from '../../utils/digits';

export default function CategoriesScreen() {
  const { data } = useDbQuery((db) => ({
    categories: listCategories(db),
    usage: getCategoryUsageCounts(db),
  }));

  const categories = data?.categories ?? [];
  const usage = data?.usage ?? {};
  const groups: { type: TransactionType; title: string; items: Category[] }[] = [
    {
      type: 'expense',
      title: 'دسته‌بندی‌های هزینه',
      items: categories.filter((category) => category.type === 'expense'),
    },
    {
      type: 'income',
      title: 'دسته‌بندی‌های درآمد',
      items: categories.filter((category) => category.type === 'income'),
    },
  ];

  return (
    <Screen>
      <ScreenHeader
        title="دسته‌بندی‌ها"
        subtitle={`${toPersianDigits(categories.length)} دسته‌بندی فعال`}
      />

      {groups.map((group) => (
        <View key={group.type} style={styles.group}>
          <SectionHeader title={group.title} />
          <Card style={styles.listCard}>
            {group.items.map((category, index) => (
              <View
                key={category.id}
                style={[styles.row, index < group.items.length - 1 && styles.separator]}>
                <CategoryIcon icon={category.icon} color={category.color} size={38} />
                <AppText variant="label" numberOfLines={1} style={styles.name}>
                  {category.name}
                </AppText>
                <AppText variant="caption" style={styles.usage}>
                  {toPersianDigits(usage[category.id] ?? 0)} تراکنش
                </AppText>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <AppText variant="caption" style={styles.hintText}>
          این دسته‌بندی‌ها در اولین اجرا ساخته شده‌اند. افزودن، ویرایش و حذف دسته‌بندی در گام
          بعدی فعال می‌شود.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: {
    flex: 1,
  },
  usage: {
    color: colors.textFaint,
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
