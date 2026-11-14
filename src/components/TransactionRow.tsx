import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, I18nManager, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { formatShamsiShort } from '../utils/jalali';
import { AppText } from './AppText';

// ————————————————————————————————————————————————————————————————————————————
// هماهنگی «فقط یک ردیف باز»
//
// چرا رجیستری ماژولی و نه state والد؟ والدها (داشبورد و شیت‌ها) ردیف‌ها را memo
// شده نگه می‌دارند؛ بالا بردن وضعیت بازبودن به والد یعنی با هر باز/بسته شدن، همه‌ی
// ردیف‌ها دوباره رندر شوند و قرارداد memo بی‌اثر شود. این رجیستری فقط بین خود
// ردیف‌ها هماهنگ می‌کند، هیچ رندر اضافه‌ای ندارد و از بیرون هم قابل صدا زدن است.
// ————————————————————————————————————————————————————————————————————————————
interface OpenRowHandle {
  id: number;
  close: () => void;
}

let activeOpenRow: OpenRowHandle | null = null;

/** ردیفِ بازِ فعلی (اگر باشد) را می‌بندد؛ برای «تپ هرجای دیگر» و شروع اسکرول لیست. */
export function closeOpenTransactionRow(): void {
  activeOpenRow?.close();
}

function isAnotherRowOpen(rowId: number): boolean {
  return activeOpenRow !== null && activeOpenRow.id !== rowId;
}

function claimOpenRow(id: number, close: () => void): void {
  if (activeOpenRow && activeOpenRow.id !== id) {
    activeOpenRow.close();
  }
  activeOpenRow = { id, close };
}

function releaseOpenRow(id: number): void {
  if (activeOpenRow?.id === id) {
    activeOpenRow = null;
  }
}

/** حداکثر پهنای کشوی عملیات؛ روی صفحه‌های باریک، نسبتی از عرض ردیف هم سقف می‌گذارد. */
const DRAWER_MAX_WIDTH = 264;
const DRAWER_WIDTH_RATIO = 0.82;
/** آستانه‌ی تشخیص سوایپ افقی و نسبت غلبه‌اش بر اسکرول عمودی. */
const SWIPE_SLOP = 12;
const SWIPE_AXIS_RATIO = 1.5;

interface TransactionRowProps {
  transaction: TransactionWithCategory;
  /** لمس ردیفِ بسته. اگر ندهید، لمس روی `onEdit` می‌افتد (رفتار قبلی). */
  onSelect?: (transaction: TransactionWithCategory) => void;
  onEdit?: (transaction: TransactionWithCategory) => void;
  onDelete?: (transaction: TransactionWithCategory) => void;
  /** اکشن‌های کشوی سوایپ؛ والد عملیات داده را انجام می‌دهد. */
  onChangeCategory?: (transaction: TransactionWithCategory) => void;
  onDuplicate?: (transaction: TransactionWithCategory) => void;
}

function ActionButton({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        danger && styles.dangerButton,
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={14} color={danger ? colors.expense : colors.textMuted} />
    </Pressable>
  );
}

/** دکمه‌ی کشوی سوایپ: آیکون + برچسب فارسی در قاب نرم. */
function DrawerActionButton({
  icon,
  label,
  hint,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.drawerAction, pressed && styles.pressed]}>
      <View style={[styles.drawerActionIcon, danger && styles.drawerActionIconDanger]}>
        <Ionicons name={icon} size={16} color={danger ? colors.expense : colors.textMuted} />
      </View>
      <AppText variant="caption" numberOfLines={2} style={styles.drawerActionLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * یک تراکنش به شکل کارت مدرن: آیکون رنگی در قاب نرم، مبلغ علامت‌دار و
 * دکمه‌های ویرایش/حذف. لمس کارت کمی جمع می‌شود تا حس زنده‌بودن بدهد.
 *
 * سوایپ به چپ (در RTL؛ یعنی در جهت مخالف خواندن) کشوی چهار اکشن را بیرون
 * می‌آورد: تغییر سریع دسته‌بندی، تکرار سریع، ویرایش و حذف. کشو از لبه‌ی فیزیکی
 * راست باز می‌شود و کارت همراه انگشت به چپ می‌رود تا حس «کشیدن» طبیعی باشد.
 *
 * با `memo` بسته شده: لیست داشبورد و گزارش‌ها می‌تواند صدها ردیف داشته باشد و هر
 * تغییر فیلتر/جستجو نباید ردیف‌های بدون تغییر را دوباره رندر کند. برای اینکه
 * memo اثر داشته باشد، والدها باید `transaction` و کال‌بک‌ها را پایدار نگه دارند.
 */
function TransactionRowComponent({
  transaction,
  onSelect,
  onEdit,
  onDelete,
  onChangeCategory,
  onDuplicate,
}: TransactionRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scale = useRef(new Animated.Value(1)).current;

  // جابه‌جایی افقی: ۰ = بسته، تا اندازه‌ی کشو = باز (منفی).
  const translation = useRef(new Animated.Value(0)).current;
  const [isOpen, setOpen] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  // نسخه‌ی ref وضعیت بازبودن: کال‌بک‌های PanResponder یک‌بار ساخته می‌شوند و باید
  // مقدار «همین حالا» را ببینند، نه مقدار زمان ساخت را.
  const isOpenRef = useRef(false);
  // مبدأ حرکت در ابتدای هر گرفتن انگشت؛ اگر وسط انیمیشن باز/بسته انگشت بگذاریم،
  // مقدار جاری انیمیشن می‌شود تا کشو نپرد.
  const baseOffsetRef = useRef(0);
  // آخرین مقدار جابه‌جایی که خودمان حین کشیدن حساب کرده‌ایم. تصمیم گرفتن/رها
  // کردن در release از همین خوانده می‌شود، نه از gestureState: روی برخی پلتفرم‌ها
  // (مثل نسخه‌ی وب) رخداد رهاسازی اطلاعات لمسی همراه ندارد و dx صفر می‌شود.
  const lastOffsetRef = useRef(0);
  // اسنپ‌شات وضعیت در لحظه‌ی شروع لمس همین ردیف: «خودش باز بود؟» و «ردیف دیگری باز
  // بود؟». لازم است چون هندلر والد («تپ هرجای دیگر») در همان لمس کشو را زودتر می‌بندد؛
  // اگر وضعیت جاری را می‌خواندیم، تپِ بستن به «انتخاب/ویرایش» تبدیل می‌شد.
  const selfWasOpenRef = useRef(false);
  const otherRowWasOpenRef = useRef(false);

  const drawerWidth =
    rowWidth > 0
      ? Math.min(DRAWER_MAX_WIDTH, Math.max(0, Math.round(rowWidth * DRAWER_WIDTH_RATIO)))
      : DRAWER_MAX_WIDTH;

  // بدون هیچ اکشنی کشو معنایی ندارد؛ پس سوایپ هم غیرفعال می‌شود (مثلاً در شیت دسته).
  const hasSwipeActions = Boolean(onChangeCategory || onDuplicate || onEdit || onDelete);
  const canSelect = Boolean(onSelect || onEdit);

  const animate = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 140,
    }).start();
  };

  const closeRow = useCallback(() => {
    isOpenRef.current = false;
    setOpen(false);
    releaseOpenRow(transaction.id);
    Animated.spring(translation, {
      toValue: 0,
      // همین مقدار حین کشیدن انگشت با setValue از JS به‌روز می‌شود؛ درایور native با
      // setValue قاطی می‌شود، پس این انیمیشن عمداً روی درایور JS می‌ماند.
      useNativeDriver: false,
      friction: 8,
      tension: 120,
    }).start();
  }, [transaction.id, translation]);

  const openRow = useCallback(() => {
    isOpenRef.current = true;
    setOpen(true);
    claimOpenRow(transaction.id, closeRow);
    Animated.spring(translation, {
      toValue: -drawerWidth,
      useNativeDriver: false,
      friction: 8,
      tension: 120,
    }).start();
  }, [closeRow, drawerWidth, transaction.id, translation]);

  // چرخش صفحه/تغییر عرض ردیف: اگر کشو باز است، با عرض جدید تراز شود.
  useEffect(() => {
    if (isOpenRef.current) {
      translation.setValue(-drawerWidth);
    }
  }, [drawerWidth, translation]);

  // ردیف‌های لیست مجازی مرتب unmount می‌شوند؛ ثبت ماژولی نباید به کال‌بک مرده اشاره کند.
  useEffect(() => () => releaseOpenRow(transaction.id), [transaction.id]);

  // تبدیل مقدار جابه‌جایی به حرکت کشو: وقتی کارت ‏D‏ به چپ می‌رود، کشو از
  // «D بیرون‌تر از لبه» به جای خودش می‌رسد (کارت و کشو همیشه چسبیده می‌مانند).
  const drawerShift = useMemo(
    () =>
      translation.interpolate({
        inputRange: [-drawerWidth, 0],
        outputRange: [0, drawerWidth],
      }),
    [drawerWidth, translation],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // در حالت بسته فقط کشیدن «به چپ» گرفته می‌شود (جهت باز شدن کشو)؛ کشیدن به راست
        // از ردیف عبور می‌کند تا سوایپ «حالت قبلی» داشبورد (که روی ناحیه‌ی لیست نشسته)
        // آن را بگیرد. بدون این تفکیک، این دو ژست روی ردیف با هم می‌جنگیدند.
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (!hasSwipeActions) {
            return false;
          }
          const horizontal =
            Math.abs(gesture.dx) > 16 &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8;
          if (!horizontal) {
            return false;
          }
          return isOpenRef.current ? true : gesture.dx < 0;
        },
        // همین شرط در فاز capture هم گرفته میشود تا روی پلتفرمهایی که ترتیب
        // پرسوجوی responder متفاوت است (مثل نسخهی وب) هم ردیف بر سوایپ والد مقدم بماند.
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (!hasSwipeActions) {
            return false;
          }
          const horizontal =
            Math.abs(gesture.dx) > 16 &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8;
          if (!horizontal) {
            return false;
          }
          return isOpenRef.current ? true : gesture.dx < 0;
        },
        onPanResponderGrant: () => {
          translation.stopAnimation((value) => {
            baseOffsetRef.current = value;
            lastOffsetRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = baseOffsetRef.current + gesture.dx;
          const clamped = Math.min(0, Math.max(-drawerWidth, next));
          lastOffsetRef.current = clamped;
          translation.setValue(clamped);
        },
        onPanResponderRelease: (_, gesture) => {
          const current = lastOffsetRef.current;
          // اول سرعت انگشت تصمیم می‌گیرد؛ وگرنه فاصله‌ی مانده تا نیمه‌ی کشو.
          const shouldOpen =
            gesture.vx < -0.25 ? true : gesture.vx > 0.25 ? false : current <= -drawerWidth * 0.5;
          if (shouldOpen) {
            openRow();
          } else {
            closeRow();
          }
        },
        // ژست توسط بقیه قطع شد (مثلاً اسکرول): به حالت بسته‌ی امن برگرد.
        onPanResponderTerminate: () => {
          closeRow();
        },
        // تا وقتی خودمان رها نکرده‌ایم، ژست را نگه می‌داریم. بدون این، لایه‌ی والد
        // (که روی ناحیه‌ی لیست نشسته و هر درگ افقی را می‌گیرد) وسط کشیدن سوایپ را
        // از ردیف می‌قاپد و کشو هرگز باز نمی‌شود.
        onPanResponderTerminationRequest: () => false,
      }),
    [closeRow, drawerWidth, hasSwipeActions, openRow, translation],
  );

  const runAction = (action: () => void) => {
    closeRow();
    action();
  };

  const handlePress = () => {
    const selfWasOpen = selfWasOpenRef.current || isOpenRef.current;
    const otherWasOpen = otherRowWasOpenRef.current;
    // اسنپ‌شات مصرف شد؛ تا شروع لمس بعدی بی‌اعتبار است.
    selfWasOpenRef.current = false;
    otherRowWasOpenRef.current = false;

    // تپ روی ردیفِ باز، فقط می‌بندد (حتی اگر هندلر والد همان لحظه بسته باشدش).
    if (selfWasOpen) {
      closeRow();
      return;
    }
    // تپ روی این ردیف وقتی ردیف دیگری باز بود: فقط همان را می‌بندد و انتخاب نمی‌کند.
    if (otherWasOpen) {
      return;
    }
    if (isAnotherRowOpen(transaction.id)) {
      closeOpenTransactionRow();
      return;
    }
    if (onSelect) {
      onSelect(transaction);
      return;
    }
    onEdit?.(transaction);
  };

  const isIncome = transaction.type === 'income';
  const color = isIncome ? colors.income : colors.expense;
  const note = transaction.note?.trim();
  const categoryColor = transaction.category_color ?? colors.textFaint;
  const transactionName = transaction.category_name ?? 'تراکنش';
  // کشو همیشه از لبه‌ی فیزیکی راست بیرون می‌آید: در RTL لبه‌ی شروع و در LTR لبه‌ی
  // پایان. چون left/right در RTL جابه‌جا تفسیر می‌شوند، عمداً از start/end منطقی
  // استفاده می‌کنیم تا رفتار در هر دو جهت درست بماند.
  const drawerAnchor = I18nManager.isRTL ? styles.drawerAnchorStart : styles.drawerAnchorEnd;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View
        style={styles.clip}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setRowWidth((current) => (Math.abs(current - width) < 1 ? current : width));
        }}
        // این رویداد از فرزندان به بالا حباب می‌کند؛ پس زودتر از هندلر والد
        // (که «تپ هرجای دیگر» را می‌بندد) اجرا می‌شود و وضعیت درست را می‌بینیم.
        onTouchStart={() => {
          selfWasOpenRef.current = isOpenRef.current;
          otherRowWasOpenRef.current = isAnotherRowOpen(transaction.id);
        }}
        {...panResponder.panHandlers}>
        <Animated.View style={[styles.cardInner, { transform: [{ translateX: translation }] }]}>
          <Pressable
            accessibilityRole={canSelect ? 'button' : undefined}
            accessibilityLabel={
              canSelect
                ? `${transactionName}، ${formatShamsiShort(transaction.date)}، ${formatAmount(transaction.amount)} تومان`
                : undefined
            }
            accessibilityHint={hasSwipeActions ? 'برای عملیات بیشتر، ردیف را به چپ بکش' : undefined}
            disabled={!canSelect}
            onPress={canSelect ? handlePress : undefined}
            onPressIn={() => animate(0.98)}
            onPressOut={() => animate(1)}
            style={styles.main}>
            <View
              style={[
                styles.badge,
                { backgroundColor: `${categoryColor}1A`, borderColor: `${categoryColor}30` },
              ]}>
              <Ionicons
                name={(transaction.category_icon ?? 'help-circle-outline') as keyof typeof Ionicons.glyphMap}
                size={18}
                color={categoryColor}
              />
            </View>

            <View style={styles.middle}>
              <AppText variant="label" numberOfLines={1} ellipsizeMode="tail">
                {transaction.category_name ?? 'بدون دسته‌بندی'}
              </AppText>
              <AppText variant="caption" numberOfLines={1} ellipsizeMode="tail" style={styles.meta}>
                {`${formatShamsiShort(transaction.date)}${note ? ` · ${note}` : ''}`}
              </AppText>
            </View>
          </Pressable>

          <View style={styles.side}>
            <AppText
              variant="amountSmall"
              style={{ color }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}>
              {`${isIncome ? '+' : '−'}${formatAmount(transaction.amount)}`}
            </AppText>

            {onEdit || onDelete ? (
              <View style={styles.actions}>
                {onEdit ? (
                  <ActionButton icon="pencil-outline" label="ویرایش" onPress={() => onEdit(transaction)} />
                ) : null}
                {onDelete ? (
                  <ActionButton
                    icon="trash-outline"
                    label="حذف"
                    danger
                    onPress={() => onDelete(transaction)}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            drawerAnchor,
            { width: drawerWidth, transform: [{ translateX: drawerShift }] },
          ]}
          pointerEvents={isOpen ? 'auto' : 'none'}>
          {onChangeCategory ? (
            <DrawerActionButton
              icon="albums-outline"
              label="تغییر سریع دسته‌بندی"
              hint={transactionName}
              onPress={() => runAction(() => onChangeCategory(transaction))}
            />
          ) : null}
          {onDuplicate ? (
            <DrawerActionButton
              icon="copy-outline"
              label="تکرار سریع تراکنش"
              hint={transactionName}
              onPress={() => runAction(() => onDuplicate(transaction))}
            />
          ) : null}
          {onEdit ? (
            <DrawerActionButton
              icon="pencil-outline"
              label="ویرایش"
              hint={transactionName}
              onPress={() => runAction(() => onEdit(transaction))}
            />
          ) : null}
          {onDelete ? (
            <DrawerActionButton
              icon="trash-outline"
              label="حذف"
              hint={transactionName}
              danger
              onPress={() => runAction(() => onDelete(transaction))}
            />
          ) : null}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export const TransactionRow = memo(TransactionRowComponent);

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    clip: {
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      // کشو بیرون از لبه می‌ماند و باید بریده شود؛ بدون این، ردیف بسته هم کشو را نشان می‌داد.
      overflow: 'hidden',
    },
    cardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md - 1,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.surface,
      gap: 6,
      paddingHorizontal: 4,
    },
    drawerAnchorStart: {
      start: 0,
    },
    drawerAnchorEnd: {
      end: 0,
    },
    drawerAction: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 2,
      paddingVertical: spacing.sm,
    },
    drawerActionIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    drawerActionIconDanger: {
      backgroundColor: colors.expenseSoft,
    },
    drawerActionLabel: {
      color: colors.textMuted,
      fontSize: 9.5,
      lineHeight: 13,
      textAlign: 'center',
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    main: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    middle: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    meta: {
      color: colors.textMuted,
    },
    side: {
      minWidth: 78,
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.xs + 1,
    },
    actionButton: {
      width: 26,
      height: 26,
      borderRadius: radius.sm - 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    dangerButton: {
      backgroundColor: colors.expenseSoft,
    },
    pressed: {
      opacity: 0.6,
    },
  });
