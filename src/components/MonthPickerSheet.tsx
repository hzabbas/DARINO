import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { toPersianDigits } from '../utils/digits';
import { JALALI_MONTHS, getJalaliParts } from '../utils/jalali';
import { AppText } from './AppText';

interface MonthPickerSheetProps {
  visible: boolean;
  selectedMonth: { jy: number; jm: number } | null;
  onClose: () => void;
  onSelect: (jy: number, jm: number) => void;
}

/** انتخاب یک ماه شمسی مشخص برای گزارش‌ها. */
export function MonthPickerSheet({
  visible,
  selectedMonth,
  onClose,
  onSelect,
}: MonthPickerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = getJalaliParts(new Date());
  const [viewYear, setViewYear] = useState(selectedMonth?.jy ?? current.jy);

  useEffect(() => {
    if (visible) {
      setViewYear(selectedMonth?.jy ?? getJalaliParts(new Date()).jy);
    }
  }, [visible, selectedMonth]);

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
            <AppText variant="subtitle">انتخاب ماه شمسی</AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.navRow}>
            <Pressable
              onPress={() => setViewYear((year) => year - 1)}
              hitSlop={6}
              style={styles.navButton}
              accessibilityLabel="سال قبل">
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </Pressable>

            <AppText variant="label" style={styles.yearLabel}>
              {toPersianDigits(viewYear)}
            </AppText>

            <Pressable
              onPress={() => setViewYear((year) => year + 1)}
              hitSlop={6}
              style={styles.navButton}
              accessibilityLabel="سال بعد">
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {JALALI_MONTHS.map((month, index) => {
              const monthNumber = index + 1;
              const isSelected =
                selectedMonth?.jy === viewYear && selectedMonth?.jm === monthNumber;
              const isCurrent = viewYear === current.jy && monthNumber === current.jm;

              return (
                <Pressable
                  key={month}
                  onPress={() => {
                    onSelect(viewYear, monthNumber);
                    onClose();
                  }}
                  style={[
                    styles.monthPill,
                    isCurrent && !isSelected && styles.currentPill,
                    isSelected && styles.selectedPill,
                  ]}>
                  <AppText
                    variant="label"
                    style={[
                      styles.monthText,
                      isCurrent && !isSelected && styles.currentText,
                      isSelected && styles.selectedText,
                    ]}>
                    {month}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
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
    gap: spacing.lg,
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  yearLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthPill: {
    width: '31%',
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  currentPill: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  selectedPill: {
    backgroundColor: colors.primary,
  },
  monthText: {
    color: colors.text,
  },
  currentText: {
    color: colors.primary,
  },
  selectedText: {
    color: colors.white,
  },
});
