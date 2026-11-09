import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDatabase } from '../db/DatabaseProvider';
import { createCategory } from '../db/categories';
import { colors, fonts, radius, spacing } from '../theme';
import type { TransactionType } from '../types/models';
import { AppText } from './AppText';
import { PrimaryButton } from './PrimaryButton';

const ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'cart-outline',
  'restaurant-outline',
  'car-outline',
  'speedometer-outline',
  'build-outline',
  'water-outline',
  'wifi-outline',
  'phone-portrait-outline',
  'receipt-outline',
  'home-outline',
  'medkit-outline',
  'shirt-outline',
  'book-outline',
  'cash-outline',
  'gift-outline',
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

interface NewCategorySheetProps {
  visible: boolean;
  type: TransactionType;
  onClose: () => void;
  onCreated: (categoryId: number) => void;
}

/** ساخت سریع دسته‌بندی جدید، بدون خروج از فرم تراکنش. */
export function NewCategorySheet({ visible, type, onClose, onCreated }: NewCategorySheetProps) {
  const database = useDatabase();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('cart-outline');
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setError(null);
      setIcon(type === 'income' ? 'cash-outline' : 'cart-outline');
      setColor(type === 'income' ? '#10B981' : '#EF4444');
    }
  }, [visible, type]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('نام دسته‌بندی را وارد کن');
      return;
    }

    try {
      const id = createCategory(database, { name: trimmed, type, icon, color });
      onCreated(id);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'ساخت دسته‌بندی ناموفق بود');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="بستن" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrapper}>
          <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
            <View style={styles.headerRow}>
              <View>
                <AppText variant="subtitle">دسته‌بندی جدید</AppText>
                <AppText variant="caption" style={styles.subtitle}>
                  {type === 'income' ? 'برای درآمدها' : 'برای هزینه‌ها'}
                </AppText>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}>
              <TextInput
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError(null);
                }}
                placeholder="مثلاً خرید کتاب"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                style={styles.input}
                autoFocus
              />

              <AppText variant="caption" style={styles.sectionLabel}>
                آیکون
              </AppText>
              <View style={styles.iconGrid}>
                {ICONS.map((item) => {
                  const selected = item === icon;
                  return (
                    <Pressable
                      key={item}
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
                      {selected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
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

              <PrimaryButton label="افزودن دسته‌بندی" icon="add" onPress={handleSubmit} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
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
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  sectionLabel: {
    color: colors.textMuted,
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
