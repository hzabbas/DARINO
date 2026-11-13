import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDatabase } from '../db/DatabaseProvider';
import { createCategory, updateCategory } from '../db/categories';
import { useFocusScroll } from '../hooks/useFocusScroll';
import { useSheetKeyboard } from '../hooks/useKeyboard';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Category, TransactionType } from '../types/models';
import { directionForInput } from '../utils/bidi';
import { AppText } from './AppText';
import { PrimaryButton } from './PrimaryButton';
import { SegmentedControl } from './SegmentedControl';
import { toPersianErrorMessage } from '../utils/errors';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: IconName[] = [
  'car-outline',
  'car-sport-outline',
  'speedometer-outline',
  'flame-outline',
  'build-outline',
  'construct-outline',
  'water-outline',
  'restaurant-outline',
  'fast-food-outline',
  'cafe-outline',
  'basket-outline',
  'cart-outline',
  'phone-portrait-outline',
  'wifi-outline',
  'receipt-outline',
  'wallet-outline',
  'card-outline',
  'cash-outline',
  'home-outline',
  'medkit-outline',
  'shirt-outline',
  'book-outline',
  'gift-outline',
  'bus-outline',
  'airplane-outline',
  'briefcase-outline',
  'paw-outline',
  'fitness-outline',
  'school-outline',
  'hammer-outline',
];

const PALETTE = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#10B981',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#0F766E',
];

const TYPE_OPTIONS = [
  { value: 'expense' as TransactionType, label: 'هزینه', icon: 'arrow-up-circle-outline' as const },
  { value: 'income' as TransactionType, label: 'درآمد', icon: 'arrow-down-circle-outline' as const },
];

interface CategorySheetProps {
  visible: boolean;
  /** اگر مقدار داشته باشد، حالت ویرایش است */
  category?: Category | null;
  /** نوع پیش‌فرض در حالت ایجاد */
  initialType?: TransactionType;
  /** در حالت ایجاد، امکان تغییر نوع را نشان بده */
  allowTypeSelection?: boolean;
  onClose: () => void;
  onSaved: (categoryId: number) => void;
}

/** ساخت و ویرایش دسته‌بندی: نام، نوع، آیکون و رنگ. */
export function CategorySheet({
  visible,
  category,
  initialType = 'expense',
  allowTypeSelection = false,
  onClose,
  onSaved,
}: CategorySheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const database = useDatabase();
  const insets = useSafeAreaInsets();
  // دیالوگ بومی اندروید adjustResize اکتیویتی را دنبال نمی‌کند؛ پس شیت را خودمان
  // بالای کیبورد می‌آوریم و ارتفاعش را محدود می‌کنیم.
  const sheet = useSheetKeyboard(insets.top);
  const formScroll = useFocusScroll();
  const isEditing = Boolean(category);

  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>(initialType);
  const [icon, setIcon] = useState<IconName>('cart-outline');
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const baseType = category?.type ?? initialType;
    setName(category?.name ?? '');
    setType(baseType);
    setIcon((category?.icon as IconName) ?? (baseType === 'income' ? 'cash-outline' : 'cart-outline'));
    setColor(category?.color ?? (baseType === 'income' ? '#10B981' : '#EF4444'));
    setError(null);
  }, [visible, category, initialType]);

  const handleTypeChange = (nextType: TransactionType) => {
    // اگر کاربر هنوز آیکون/رنگ پیش‌فرض را عوض نکرده، با تغییر نوع هم عوض شوند
    const defaultIcon = type === 'income' ? 'cash-outline' : 'cart-outline';
    const defaultColor = type === 'income' ? '#10B981' : '#EF4444';
    if (icon === defaultIcon) {
      setIcon(nextType === 'income' ? 'cash-outline' : 'cart-outline');
    }
    if (color === defaultColor) {
      setColor(nextType === 'income' ? '#10B981' : '#EF4444');
    }
    setType(nextType);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('نام دسته‌بندی را وارد کن');
      return;
    }

    try {
      if (category) {
        // نوع دسته‌بندی ویرایش نمی‌شود تا تراکنش‌های قبلی ناسازگار نشوند
        updateCategory(database, category.id, { name: trimmed, type: category.type, icon, color });
        onSaved(category.id);
      } else {
        const id = createCategory(database, { name: trimmed, type, icon, color });
        onSaved(id);
      }
      onClose();
    } catch (submitError) {
      setError(toPersianErrorMessage(submitError, 'ذخیره‌ی دسته‌بندی ناموفق بود'));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: sheet.lift }]} onLayout={sheet.onLayout}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="بستن" />

        <View
          style={[
            styles.sheet,
            { paddingBottom: spacing.xl + insets.bottom, maxHeight: sheet.maxHeight },
          ]}>
          <View style={styles.headerRow}>
            <View>
              <AppText variant="subtitle">
                {isEditing ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
              </AppText>
              <AppText variant="caption" style={styles.subtitle}>
                {isEditing ? 'نام، آیکون و رنگ را تغییر بده' : 'ظاهر دسته‌بندی را انتخاب کن'}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            ref={formScroll.scrollRef}
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              onFocus={formScroll.onFocus}
              placeholder="مثلاً خرید کتاب"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.primary}
              style={[
                styles.input,
                { writingDirection: directionForInput(name, 'مثلاً خرید کتاب') },
              ]}
              autoFocus={!isEditing}
            />

              <AppText variant="caption" style={styles.sectionLabel}>
                نوع
              </AppText>
              {isEditing ? (
                <View style={styles.typeBadge}>
                  <Ionicons
                    name={type === 'income' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    size={16}
                    color={type === 'income' ? colors.income : colors.expense}
                  />
                  <AppText
                    variant="label"
                    style={{ color: type === 'income' ? colors.income : colors.expense }}>
                    {type === 'income' ? 'درآمد' : 'هزینه'}
                  </AppText>
                  <AppText variant="caption" style={styles.typeHint}>
                    نوع دسته‌بندی قابل تغییر نیست
                  </AppText>
                </View>
              ) : allowTypeSelection ? (
                <SegmentedControl value={type} options={TYPE_OPTIONS} onChange={handleTypeChange} />
              ) : (
                <View style={styles.typeBadge}>
                  <Ionicons
                    name={type === 'income' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    size={16}
                    color={type === 'income' ? colors.income : colors.expense}
                  />
                  <AppText
                    variant="label"
                    style={{ color: type === 'income' ? colors.income : colors.expense }}>
                    {type === 'income' ? 'درآمد' : 'هزینه'}
                  </AppText>
                </View>
              )}

              <AppText variant="caption" style={styles.sectionLabel}>
                آیکون
              </AppText>
              <View style={styles.iconGrid}>
                {ICONS.map((item) => {
                  const selected = item === icon;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setIcon(item)}
                      style={[
                        styles.iconOption,
                        selected && { backgroundColor: `${color}1F`, borderColor: color },
                      ]}>
                      <Ionicons name={item} size={20} color={selected ? color : colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>

              <AppText variant="caption" style={styles.sectionLabel}>
                رنگ
              </AppText>
              <View style={styles.colorRow}>
                {PALETTE.map((item) => {
                  const selected = item === color;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setColor(item)}
                      accessibilityLabel={`رنگ ${item}`}
                      style={[styles.colorOption, { backgroundColor: item }]}>
                      {selected ? (
                        <Ionicons name="checkmark" size={16} color={colors.white} />
                      ) : null}
                    </Pressable>
                  );
                })}
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
                label={isEditing ? 'ذخیره تغییرات' : 'افزودن دسته‌بندی'}
                icon={isEditing ? 'checkmark-circle-outline' : 'add'}
                onPress={handleSubmit}
              />
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
  sheetScroll: { flexShrink: 1 },
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  subtitle: {
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'right',
  },
  sectionLabel: {
    color: colors.textMuted,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typeHint: {
    marginLeft: spacing.xs,
    color: colors.textFaint,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
  },
  colorOption: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
