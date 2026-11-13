import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Category } from '../types/models';
import { toPersianDigits } from '../utils/digits';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';
import { PrimaryButton } from './PrimaryButton';

type Step = 'choice' | 'move' | 'confirm-all';

interface CategoryDeleteSheetProps {
  visible: boolean;
  category: Category | null;
  transactionCount: number;
  /** دسته‌بندی‌های هم‌نوع به‌جز خودش، برای انتقال تراکنش‌ها */
  destinations: Category[];
  onClose: () => void;
  onDeleteEmpty: () => void;
  onMoveAndDelete: (targetCategoryId: number) => void;
  onDeleteAll: () => void;
}

/**
 * حذف ایمن دسته‌بندی:
 * بدون تراکنش → تایید ساده؛ با تراکنش → انتقال به دسته دیگر یا حذف همراه تراکنش‌ها.
 */
export function CategoryDeleteSheet({
  visible,
  category,
  transactionCount,
  destinations,
  onClose,
  onDeleteEmpty,
  onMoveAndDelete,
  onDeleteAll,
}: CategoryDeleteSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('choice');
  const [targetId, setTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('choice');
      setTargetId(null);
    }
  }, [visible, category]);

  if (!category) {
    return null;
  }

  const hasTransactions = transactionCount > 0;
  const canMove = destinations.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="بستن" />

        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.headerRow}>
            <AppText variant="subtitle">
              {step === 'move'
                ? 'انتخاب دسته‌ی مقصد'
                : step === 'confirm-all'
                  ? 'حذف قطعی'
                  : 'حذف دسته‌بندی'}
            </AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.categoryCard}>
              <CategoryIcon icon={category.icon} color={category.color} size={40} />
              <View style={styles.categoryTexts}>
                <AppText variant="label" numberOfLines={1}>
                  {category.name}
                </AppText>
                <AppText variant="caption" style={styles.categoryMeta}>
                  {hasTransactions
                    ? `${toPersianDigits(transactionCount)} تراکنش`
                    : 'بدون تراکنش'}
                </AppText>
              </View>
            </View>

            {!hasTransactions ? (
              <>
                <AppText variant="body" style={styles.message}>
                  این دسته‌بندی هیچ تراکنشی ندارد و با تایید، برای همیشه حذف می‌شود.
                </AppText>
                <PrimaryButton
                  label="حذف دسته‌بندی"
                  icon="trash-outline"
                  backgroundColor={colors.expense}
                  onPress={onDeleteEmpty}
                />
                <PrimaryButton label="انصراف" variant="ghost" onPress={onClose} />
              </>
            ) : step === 'choice' ? (
              <>
                <View style={styles.warningBox}>
                  <Ionicons name="warning-outline" size={18} color={colors.expense} />
                  <AppText variant="caption" style={styles.warningText}>
                    {toPersianDigits(transactionCount)} تراکنش به این دسته‌بندی وصل است. قبل از
                    حذف، تکلیف آن‌ها را مشخص کن.
                  </AppText>
                </View>

                <Pressable
                  disabled={!canMove}
                  onPress={() => setStep('move')}
                  style={[styles.option, !canMove && styles.optionDisabled]}>
                  <View style={styles.optionIcon}>
                    <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.optionTexts}>
                    <AppText variant="label">انتقال تراکنش‌ها و سپس حذف</AppText>
                    <AppText variant="caption" style={styles.optionHint}>
                      {canMove
                        ? 'تراکنش‌ها به دسته‌ی دیگری از همین نوع منتقل می‌شوند.'
                        : 'دسته‌ی دیگری از این نوع نداری؛ اول یکی بساز.'}
                    </AppText>
                  </View>
                  {canMove ? (
                    <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
                  ) : null}
                </Pressable>

                <Pressable onPress={() => setStep('confirm-all')} style={styles.dangerOption}>
                  <View style={[styles.optionIcon, styles.dangerIcon]}>
                    <Ionicons name="trash-outline" size={20} color={colors.expense} />
                  </View>
                  <View style={styles.optionTexts}>
                    <AppText variant="label" style={styles.dangerLabel}>
                      حذف دسته‌بندی و همه‌ی تراکنش‌ها
                    </AppText>
                    <AppText variant="caption" style={styles.optionHint}>
                      {toPersianDigits(transactionCount)} تراکنش هم برای همیشه پاک می‌شوند.
                    </AppText>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
                </Pressable>
              </>
            ) : step === 'move' ? (
              <>
                {destinations.map((destination) => {
                  const selected = destination.id === targetId;
                  return (
                    <Pressable
                      key={destination.id}
                      onPress={() => setTargetId(destination.id)}
                      style={[styles.destination, selected && styles.destinationSelected]}>
                      <CategoryIcon
                        icon={destination.icon}
                        color={destination.color}
                        size={34}
                      />
                      <AppText variant="label" numberOfLines={1} style={styles.destinationName}>
                        {destination.name}
                      </AppText>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                    </Pressable>
                  );
                })}

                <PrimaryButton
                  label="انتقال و حذف"
                  icon="swap-horizontal-outline"
                  onPress={() => targetId && onMoveAndDelete(targetId)}
                  disabled={targetId === null}
                />
                <PrimaryButton label="بازگشت" variant="ghost" onPress={() => setStep('choice')} />
              </>
            ) : (
              <>
                <View style={styles.warningBox}>
                  <Ionicons name="warning-outline" size={18} color={colors.expense} />
                  <AppText variant="caption" style={styles.warningText}>
                    {toPersianDigits(transactionCount)} تراکنش این دسته‌بندی برای همیشه حذف
                    می‌شوند. این کار قابل بازگشت نیست.
                  </AppText>
                </View>
                <PrimaryButton
                  label="حذف قطعی"
                  icon="trash-outline"
                  backgroundColor={colors.expense}
                  onPress={onDeleteAll}
                />
                <PrimaryButton label="بازگشت" variant="ghost" onPress={() => setStep('choice')} />
              </>
            )}
          </ScrollView>
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    maxHeight: '86%',
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
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
  message: {
    color: colors.textMuted,
    marginVertical: spacing.xs,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.expenseSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: {
    flex: 1,
    color: colors.expense,
    lineHeight: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  optionDisabled: {
    opacity: 0.55,
  },
  dangerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.expense,
    backgroundColor: colors.expenseSoft,
    padding: spacing.md,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  dangerIcon: {
    backgroundColor: colors.expenseSoft,
  },
  optionTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionHint: {
    color: colors.textMuted,
    lineHeight: 18,
  },
  dangerLabel: {
    color: colors.expense,
    fontFamily: fonts.semibold,
  },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  destinationSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  destinationName: {
    flex: 1,
    minWidth: 0,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
