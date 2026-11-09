import { Ionicons } from '@expo/vector-icons';
import { j2d, toJalaali } from 'jalaali-js';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '../theme';
import { toPersianDigits } from '../utils/digits';
import { JALALI_MONTHS } from '../utils/jalali';
import { buildJalaliMonthGrid, jalaliDayToDate } from '../utils/jalaliCalendar';
import { AppText } from './AppText';

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

interface JalaliDatePickerProps {
  visible: boolean;
  value: Date;
  /** تاریخ‌های بعد از این روز قابل انتخاب نیستند (پیش‌فرض: امروز) */
  maxDate?: Date;
  onClose: () => void;
  onSelect: (date: Date) => void;
}

/** تقویم شمسی برای انتخاب هر تاریخ دلخواه. */
export function JalaliDatePicker({
  visible,
  value,
  maxDate,
  onClose,
  onSelect,
}: JalaliDatePickerProps) {
  const insets = useSafeAreaInsets();
  const selected = toJalaali(value);
  const [viewYear, setViewYear] = useState(selected.jy);
  const [viewMonth, setViewMonth] = useState(selected.jm);
  const [mode, setMode] = useState<'days' | 'years'>('days');

  useEffect(() => {
    if (visible) {
      const parts = toJalaali(value);
      setViewYear(parts.jy);
      setViewMonth(parts.jm);
      setMode('days');
    }
  }, [visible, value]);

  const maxParts = maxDate ? toJalaali(maxDate) : null;
  const maxJdn = maxParts ? j2d(maxParts.jy, maxParts.jm, maxParts.jd) : null;
  const today = toJalaali(new Date());
  const todayJdn = j2d(today.jy, today.jm, today.jd);
  const selectedJdn = j2d(selected.jy, selected.jm, selected.jd);

  const goMonth = (delta: number) => {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
    setViewMonth(month);
    setViewYear(year);
  };

  const pickDay = (day: number) => {
    onSelect(jalaliDayToDate(viewYear, viewMonth, day, value));
    onClose();
  };

  const weeks = buildJalaliMonthGrid(viewYear, viewMonth);

  const years = Array.from({ length: 12 }, (_, index) => viewYear - 5 + index);

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
            <AppText variant="subtitle">انتخاب تاریخ</AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.navRow}>
            <Pressable
              onPress={() => goMonth(-1)}
              hitSlop={6}
              style={styles.navButton}
              accessibilityLabel="ماه قبل">
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={() => setMode(mode === 'days' ? 'years' : 'days')}
              style={styles.monthButton}>
              <AppText variant="label" style={styles.monthTitle}>
                {`${JALALI_MONTHS[viewMonth - 1]} ${toPersianDigits(viewYear)}`}
              </AppText>
              <Ionicons
                name={mode === 'days' ? 'chevron-down' : 'chevron-up'}
                size={14}
                color={colors.textMuted}
              />
            </Pressable>

            <Pressable
              onPress={() => goMonth(1)}
              hitSlop={6}
              style={styles.navButton}
              accessibilityLabel="ماه بعد">
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
          </View>

          {mode === 'years' ? (
            <View style={styles.yearsGrid}>
              {years.map((year) => {
                const isCurrent = year === viewYear;
                return (
                  <Pressable
                    key={year}
                    onPress={() => {
                      setViewYear(year);
                      setMode('days');
                    }}
                    style={[styles.yearPill, isCurrent && styles.selectedYearPill]}>
                    <AppText
                      variant="label"
                      style={[styles.yearText, isCurrent && styles.selectedYearText]}>
                      {toPersianDigits(year)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((day) => (
                  <View key={day} style={styles.weekdayCell}>
                    <AppText variant="caption" style={styles.weekdayText}>
                      {day}
                    </AppText>
                  </View>
                ))}
              </View>

              {weeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.weekRow}>
                  {week.map((day, dayIndex) => {
                    if (day === null) {
                      return <View key={`empty-${dayIndex}`} style={styles.dayCell} />;
                    }

                    const jdn = j2d(viewYear, viewMonth, day);
                    const isFuture = maxJdn !== null && jdn > maxJdn;
                    const isSelected = jdn === selectedJdn;
                    const isToday = jdn === todayJdn;

                    return (
                      <Pressable
                        key={day}
                        disabled={isFuture}
                        onPress={() => pickDay(day)}
                        style={styles.dayCell}>
                        <View
                          style={[
                            styles.dayCircle,
                            isToday && !isSelected && styles.todayCircle,
                            isSelected && styles.selectedCircle,
                          ]}>
                          <AppText
                            variant="label"
                            style={[
                              styles.dayText,
                              isFuture && styles.disabledDayText,
                              isSelected && styles.selectedDayText,
                            ]}>
                            {toPersianDigits(day)}
                          </AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          )}

          <Pressable
            onPress={() => {
              onSelect(new Date());
              onClose();
            }}
            style={styles.todayButton}>
            <Ionicons name="today-outline" size={16} color={colors.primary} />
            <AppText variant="label" style={styles.todayText}>
              امروز
            </AppText>
          </Pressable>
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  monthTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  weekdayText: {
    color: colors.textFaint,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircle: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedCircle: {
    backgroundColor: colors.primary,
  },
  dayText: {
    color: colors.text,
  },
  selectedDayText: {
    color: colors.white,
  },
  disabledDayText: {
    color: colors.textFaint,
  },
  todayButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.xs,
  },
  todayText: {
    color: colors.primary,
  },
  yearsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  yearPill: {
    width: '30%',
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  selectedYearPill: {
    backgroundColor: colors.primary,
  },
  yearText: {
    color: colors.text,
  },
  selectedYearText: {
    color: colors.white,
  },
});
