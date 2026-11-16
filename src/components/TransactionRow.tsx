import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, I18nManager, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { TransactionWithCategory } from '../types/models';
import { formatAmount } from '../utils/currency';
import { formatShamsiShort } from '../utils/jalali';
import { AppText } from './AppText';

// Module registry to ensure only one swipe drawer is open across rows.
interface OpenRowHandle {
  id: number;
  close: () => void;
}

let activeOpenRow: OpenRowHandle | null = null;

/** Close currently open transaction row drawer. */
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

/** Max drawer action width. */
const DRAWER_MAX_WIDTH = 264;
const DRAWER_WIDTH_RATIO = 0.82;
/** Horizontal swipe detection threshold. */
const SWIPE_SLOP = 12;
const SWIPE_AXIS_RATIO = 1.5;

interface TransactionRowProps {
  transaction: TransactionWithCategory;
  /** Row press callback (defaults to onEdit if omitted). */
  onSelect?: (transaction: TransactionWithCategory) => void;
  onEdit?: (transaction: TransactionWithCategory) => void;
  onDelete?: (transaction: TransactionWithCategory) => void;
  /** Swipe drawer callbacks handled by parent. */
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

/** Drawer action button with icon and label. */
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
 * Modern transaction card component with swipe drawer actions.
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

  // Horizontal translation: 0 = closed, -drawerWidth = open.
  const translation = useRef(new Animated.Value(0)).current;
  const [isOpen, setOpen] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  // Mutable ref to access current open state inside pan callbacks.
  const isOpenRef = useRef(false);
  // Base offset at gesture start to avoid animation jumping.
  const baseOffsetRef = useRef(0);
  // Stores the last observed translation to recover state on web/drop events.
  const lastOffsetRef = useRef(0);
  // Snapshot touch start state: was this row open, or was another row open?
  const selfWasOpenRef = useRef(false);
  const otherRowWasOpenRef = useRef(false);

  const drawerWidth =
    rowWidth > 0
      ? Math.min(DRAWER_MAX_WIDTH, Math.max(0, Math.round(rowWidth * DRAWER_WIDTH_RATIO)))
      : DRAWER_MAX_WIDTH;

  // Drawer is enabled only if at least one swipe action exists.
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
      // Uses JS driver to stay in sync with manual setValue updates.
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

  // Adjust translation if row width changes while drawer is open.
  useEffect(() => {
    if (isOpenRef.current) {
      translation.setValue(-drawerWidth);
    }
  }, [drawerWidth, translation]);

  // Cleanup open row registration on unmount.
  useEffect(() => () => releaseOpenRow(transaction.id), [transaction.id]);

  // Interpolate translation into drawer position.
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
        // In closed state, only capture left swipe (drawer open direction).
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
        // Match condition in capture phase for consistent web/native response.
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
          // Determine state by velocity or remaining distance.
          const shouldOpen =
            gesture.vx < -0.25 ? true : gesture.vx > 0.25 ? false : current <= -drawerWidth * 0.5;
          if (shouldOpen) {
            openRow();
          } else {
            closeRow();
          }
        },
        // Reset on gesture termination (e.g., scroll).
        onPanResponderTerminate: () => {
          closeRow();
        },
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
    // Reset snapshots after consumption.
    selfWasOpenRef.current = false;
    otherRowWasOpenRef.current = false;

    // Tapping an open row closes it.
    if (selfWasOpen) {
      closeRow();
      return;
    }
    // Tapping when another row was open closes that row only.
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
  // Use start/end anchors so drawer behaves properly in both RTL and LTR.
  const drawerAnchor = I18nManager.isRTL ? styles.drawerAnchorStart : styles.drawerAnchorEnd;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View
        style={styles.clip}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setRowWidth((current) => (Math.abs(current - width) < 1 ? current : width));
        }}
        // Captures state before parent taps to avoid misinterpreting row taps.
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
      // Clip offscreen drawer overflow.
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
