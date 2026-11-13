import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { BalanceHero } from '../../components/BalanceHero';
import { PendingSmsGateModal } from '../../components/PendingSmsGateModal';
import { EmptyState } from '../../components/EmptyState';
import { GoalProgressCard } from '../../components/GoalProgressCard';
import { RangeTabs } from '../../components/RangeTabs';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ThemeToggle } from '../../components/ThemeToggle';
import { closeOpenTransactionRow, TransactionRow } from '../../components/TransactionRow';
import { getBankBalanceBreakdown, listBankAccounts, totalBankBalance } from '../../db/bankAccounts';
import { listCategories } from '../../db/categories';
import { useDatabase } from '../../db/DatabaseProvider';
import { listPendingSms } from '../../db/pendingSms';
import { getNumericSetting, getSetting, setSetting } from '../../db/settings';
import {
  INCLUDE_BANK_BALANCE_IN_INCOME_KEY,
  sumOpeningBalanceIncomes,
} from '../../features/balanceIncome';
import {
  createTransaction,
  deleteTransaction,
  getSummary,
  listTransactions,
  updateTransaction,
} from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import {
  consumePendingSmsFocus,
  subscribePendingSmsFocus,
} from '../../features/smsFocus';
import { useSmsSync } from '../../features/useSmsSync';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import type {
  Category,
  MonthlySummary,
  TransactionType,
  TransactionWithCategory,
} from '../../types/models';
import { formatAmount, formatToman } from '../../utils/currency';
import { toPersianDigits } from '../../utils/digits';
import { confirmAction, notify } from '../../utils/dialogs';
import { toPersianErrorMessage } from '../../utils/errors';
import { formatShamsiShort, formatTodayLabel, getJalaliMonthRange, toLocalIso } from '../../utils/jalali';
import { combineSummaryWithBankBalance } from '../../utils/analytics';
import {
  DASHBOARD_RANGES,
  getRangeBounds,
  getRangeCaption,
  type DashboardRange,
} from '../../utils/ranges';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

type TypeFilter = 'all' | TransactionType;
type SortMode = 'newest' | 'highest' | 'lowest';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'income', label: 'درآمدها' },
  { value: 'expense', label: 'هزینه‌ها' },
];

const SORT_MODES: { value: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'newest', label: 'جدیدترین', icon: 'time-outline' },
  { value: 'highest', label: 'بیشترین مبلغ', icon: 'arrow-down-outline' },
  { value: 'lowest', label: 'کمترین مبلغ', icon: 'arrow-up-outline' },
];

/** فیلترهای سریع ردیف دوم چیپ‌ها؛ فقط یکی هم‌زمان می‌تواند فعال باشد. */
type QuickFilter = 'none' | 'today' | 'week' | 'month' | 'frequent' | 'bankLinked' | 'manual';

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'none', label: 'همه' },
  { value: 'today', label: 'امروز' },
  { value: 'week', label: 'این هفته' },
  { value: 'month', label: 'این ماه' },
  { value: 'frequent', label: 'پرتکرارها' },
  { value: 'bankLinked', label: 'تراکنش‌های بانکی' },
  { value: 'manual', label: 'تراکنش‌های دستی' },
];

/** آستانه‌ی فعال‌شدن سوایپ افقی تغییر حالت و مقدار جابه‌جایی لازم برای تعویض. */
const FILTER_SWIPE_SLOP = 16;
const FILTER_SWIPE_DISTANCE = 60;

/**
 * «پرتکرارها»: بین تراکنش‌های همین بازه و همین فیلتر نوع، دسته‌هایی که حداقل دو بار
 * تکرار شده‌اند و حداکثر سه دسته‌ی پرتکرارتر انتخاب می‌شوند و فقط تراکنش‌های همان
 * دسته‌ها برمی‌گردند. ملاک، تعداد تکرار است نه مبلغ؛ چون فیلتر «تکرار» است.
 */
function pickFrequentTransactions(
  transactions: TransactionWithCategory[],
): TransactionWithCategory[] {
  const counts = new Map<number, number>();
  for (const transaction of transactions) {
    if (transaction.category_id === null) {
      continue;
    }
    counts.set(transaction.category_id, (counts.get(transaction.category_id) ?? 0) + 1);
  }

  const frequentCategoryIds = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([categoryId]) => categoryId),
  );

  if (frequentCategoryIds.size === 0) {
    return [];
  }

  return transactions.filter(
    (transaction) =>
      transaction.category_id !== null && frequentCategoryIds.has(transaction.category_id),
  );
}

interface QuickCategorySheetProps {
  visible: boolean;
  transaction: TransactionWithCategory | null;
  categories: Category[];
  onClose: () => void;
  onSelect: (categoryId: number) => void;
}

/**
 * انتخاب سریع دسته‌ی یک تراکنش موجود.
 *
 * چرا از CategorySheet استفاده نشد؟ آن شیت برای ساخت/ویرایش «تعریف دسته‌بندی» است
 * (نام/آیکون/رنگ) و تراکنش نمی‌گیرد؛ پس برای «تغییر دسته‌ی همین تراکنش» مناسب نیست.
 * این شیت سبک فقط دسته‌های هم‌سنخ همین تراکنش را پیشنهاد می‌کند.
 */
function QuickCategorySheet({
  visible,
  transaction,
  categories,
  onClose,
  onSelect,
}: QuickCategorySheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const options = useMemo(
    () => (transaction ? categories.filter((category) => category.type === transaction.type) : []),
    [categories, transaction],
  );

  if (!transaction) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="بستن" />

        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetHeaderTexts}>
              <AppText variant="subtitle">تغییر سریع دسته‌بندی</AppText>
              <AppText variant="caption" style={styles.sheetSubtitle} numberOfLines={1}>
                {`${transaction.category_name ?? 'بدون دسته‌بندی'} · ${formatAmount(transaction.amount)} تومان`}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="بستن"
              onPress={onClose}
              hitSlop={8}
              style={styles.sheetCloseButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetGrid}
            showsVerticalScrollIndicator={false}>
            {options.map((category) => {
              const selected = category.id === transaction.category_id;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(category.id)}
                  style={[
                    styles.sheetTile,
                    selected && {
                      borderColor: category.color,
                      backgroundColor: `${category.color}14`,
                    },
                  ]}>
                  <View style={[styles.sheetTileIcon, { backgroundColor: `${category.color}1F` }]}>
                    <Ionicons
                      name={category.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={category.color}
                    />
                  </View>
                  <AppText variant="caption" numberOfLines={2} style={styles.sheetTileLabel}>
                    {category.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {options.length === 0 ? (
            <AppText variant="caption" style={styles.sheetSubtitle}>
              برای این نوع تراکنش دسته‌بندی‌ای ثبت نشده است.
            </AppText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default function DashboardScreen() {
  const database = useDatabase();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const listRef = useRef<FlatList<TransactionWithCategory>>(null);

  const [range, setRange] = useState<DashboardRange>('month');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [gateSkipped, setGateSkipped] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('month');
  // پیامکی که نوتیفیکیشن/لینک عمیق خواسته مستقیم روی آن باز شویم
  const [focusSmsId, setFocusSmsId] = useState<string | null>(null);
  // تراکنشی که برای «تغییر سریع دسته‌بندی» انتخاب شده است
  const [categoryTarget, setCategoryTarget] = useState<TransactionWithCategory | null>(null);
  // نسخه‌ی ref هم نگه داشته می‌شود تا کال‌بک انتخاب دسته پایدار بماند و با باز/بسته
  // شدن شیت، memo همه‌ی ردیف‌ها نشکند.
  const categoryTargetRef = useRef<TransactionWithCategory | null>(null);
  // جابه‌جایی افقی بازخوردی هنگام سوایپ تغییر حالت فیلتر
  const filterSwipeOffset = useRef(new Animated.Value(0)).current;

  // فیلتر «بانکی/دستی» در لایه‌ی داده اعمال می‌شود، نه با فیلتر سمت کلاینت
  const bankLinkFilter: 'linked' | 'manual' | undefined =
    quickFilter === 'bankLinked' ? 'linked' : quickFilter === 'manual' ? 'manual' : undefined;

  useSmsSync();

  const { data, reload } = useDbQuery(
    (db) => {
      const bounds = getRangeBounds(range);
      const monthRange = getJalaliMonthRange(new Date());
      return {
        summary: getSummary(db, bounds),
        monthSummary: getSummary(db, { startIso: monthRange.startIso, endIso: monthRange.endIso }),
        transactions: listTransactions(db, bounds, -1, bankLinkFilter ? { bankLink: bankLinkFilter } : {}),
        incomeGoal: getNumericSetting(db, 'income_goal'),
        expenseBudget: getNumericSetting(db, 'expense_budget'),
        accounts: listBankAccounts(db, true),
        totalBalance: totalBankBalance(db),
        bankBreakdown: getBankBalanceBreakdown(db, true),
        openingIncome: sumOpeningBalanceIncomes(db, bounds),
        includeBankBalance: getSetting(db, INCLUDE_BANK_BALANCE_IN_INCOME_KEY) === '1',
        pendingSms: listPendingSms(db),
        categories: listCategories(db),
      };
    },
    [range, bankLinkFilter],
  );

  // سیگنال «کدام پیامک را همین حالا باز کن؟» از نوتیفیکیشن/لینک عمیق می‌آید:
  // درخواست بی‌مصرف مانده را می‌خوانیم و بعد مشترک درخواست‌های تازه می‌شویم تا وقتی
  // داشبورد باز است هم کار کند. داده هم دوباره خوانده می‌شود چون ممکن است ردیف
  // پیامک تازه هنوز در لیست نمایش‌داده‌شده نباشد.
  useEffect(() => {
    const openFromFocus = (focus: ReturnType<typeof consumePendingSmsFocus>) => {
      if (!focus) {
        return;
      }
      setGateSkipped(false);
      setFocusSmsId(focus.smsId);
      reload();
    };

    openFromFocus(consumePendingSmsFocus());
    return subscribePendingSmsFocus(openFromFocus);
  }, [reload]);

  const rawSummary = data?.summary ?? EMPTY_SUMMARY;
  const monthSummary = data?.monthSummary ?? EMPTY_SUMMARY;
  const includeBankBalance = data?.includeBankBalance ?? false;
  const baseBankBalance = data?.bankBreakdown.totalBaseBankBalance ?? 0;
  const openingIncome = data?.openingIncome ?? 0;
  const summary = useMemo(
    () =>
      combineSummaryWithBankBalance(rawSummary, {
        include: includeBankBalance,
        openingIncomeInRange: openingIncome,
        baseBankBalance,
      }),
    [rawSummary, includeBankBalance, openingIncome, baseBankBalance],
  );
  const transactions = data?.transactions ?? [];
  const accounts = data?.accounts ?? [];
  const totalBalance = data?.totalBalance ?? 0;
  const pendingSms = data?.pendingSms ?? [];
  const rangeLabel = DASHBOARD_RANGES.find((option) => option.value === range)?.label ?? '';

  const visibleTransactions = useMemo(() => {
    const filtered =
      typeFilter === 'all'
        ? transactions
        : transactions.filter((transaction) => transaction.type === typeFilter);

    // قاعده‌ی «پرتکرارها» در pickFrequentTransactions توضیح داده شده است.
    const scoped = quickFilter === 'frequent' ? pickFrequentTransactions(filtered) : filtered;

    if (sortMode === 'newest') {
      return scoped;
    }
    if (sortMode === 'highest') {
      return [...scoped].sort((first, second) => second.amount - first.amount);
    }
    return [...scoped].sort((first, second) => first.amount - second.amount);
  }, [transactions, typeFilter, quickFilter, sortMode]);

  const sortOption = SORT_MODES.find((option) => option.value === sortMode) ?? SORT_MODES[0];

  const handleRangeChange = (nextRange: DashboardRange) => {
    setRange(nextRange);
    // چیپ‌های سریع و RangeTabs روی یک واقعیت کار می‌کنند؛ پس هر دو طرف هم‌زمان
    // همگام می‌مانند («کل زمان‌ها» معادل چیپ «همه» است).
    setQuickFilter(nextRange === 'all' ? 'none' : nextRange);
    // تغییر فیلتر = پایان کار با ردیفِ سوایپ‌شده
    closeOpenTransactionRow();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const handleQuickFilterChange = (next: QuickFilter) => {
    setQuickFilter(next);
    if (next === 'today' || next === 'week' || next === 'month') {
      // این سه چیپ دقیقاً همان بازه‌ی RangeTabs را عوض می‌کنند
      setRange(next);
    } else if (next === 'none') {
      // «همه» یعنی نه فیلتر سریع و نه بازه‌ی محدود
      setRange('all');
    }
    // «پرتکرارها/بانکی/دستی» بازه را عوض نمی‌کنند: «پرتکرارها» نسبت به همین بازه
    // معنا دارد و دو فیلتر دیگر مکمل بازه‌ی فعلی‌اند.
    closeOpenTransactionRow();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // سوایپ افقی روی ناحیه‌ی لیست، حالت فیلتر نوع را عوض می‌کند. طبق جهت‌خوانی RTL،
  // کشیدن به راست (به سمت ابتدای خواندن) حالت قبلی و کشیدن به چپ حالت بعدی را می‌دهد.
  const switchTypeFilter = useCallback((delta: number) => {
    setTypeFilter((current) => {
      const index = TYPE_FILTERS.findIndex((option) => option.value === current);
      const nextIndex = Math.min(TYPE_FILTERS.length - 1, Math.max(0, index + delta));
      return TYPE_FILTERS[nextIndex].value;
    });
  }, []);

  const filterSwipe = useMemo(
    () =>
      PanResponder.create({
        // فقط حرکت افقی واضح گرفته می‌شود تا اسکرول عمودی لیست و رفتار pull/refresh
        // و لمس‌های عادی دست‌نخورده بمانند. ردیف‌ها خودشان سوایپ چپ را می‌گیرند؛
        // این هندلر برای کشیدن راست (حالت قبلی) و کشیدن چپ روی نواحی غیرردیف است.
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (gesture.numberActiveTouches > 1) {
            return false;
          }
          return (
            Math.abs(gesture.dx) > FILTER_SWIPE_SLOP &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
          );
        },
        onPanResponderGrant: () => {
          filterSwipeOffset.setValue(0);
        },
        onPanResponderMove: (_, gesture) => {
          // بازخورد کم و مقاومتی، تا حس «کشیدن ناحیه» بدهد ولی چیدمان را نشکند
          filterSwipeOffset.setValue(gesture.dx * 0.35);
        },
        onPanResponderRelease: (_, gesture) => {
          const farEnough =
            Math.abs(gesture.dx) >= FILTER_SWIPE_DISTANCE &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy);
          const fastEnough =
            Math.abs(gesture.vx) >= 0.5 && Math.abs(gesture.dx) > FILTER_SWIPE_SLOP;
          if (farEnough || fastEnough) {
            // تعویض حالت فیلتر یعنی پایان کار با ردیفِ سوایپ‌شده
            closeOpenTransactionRow();
            switchTypeFilter(gesture.dx > 0 ? -1 : 1);
          }
          // همین مقدار با setValue از JS به‌روز می‌شود؛ درایور JS می‌مانیم.
          Animated.spring(filterSwipeOffset, {
            toValue: 0,
            useNativeDriver: false,
            friction: 7,
            tension: 140,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(filterSwipeOffset, {
            toValue: 0,
            useNativeDriver: false,
            friction: 7,
            tension: 140,
          }).start();
        },
      }),
    [filterSwipeOffset, switchTypeFilter],
  );

  const cycleSort = () => {
    const index = SORT_MODES.findIndex((option) => option.value === sortMode);
    setSortMode(SORT_MODES[(index + 1) % SORT_MODES.length].value);
  };

  const handleEdit = useCallback((transaction: TransactionWithCategory) => {
    router.push(`/edit/${transaction.id}`);
  }, []);

  const handleDelete = useCallback(
    (transaction: TransactionWithCategory) => {
      const title = transaction.category_name ?? 'این تراکنش';
      confirmAction({
        title: 'حذف تراکنش',
        message: `${title} به مبلغ ${formatToman(transaction.amount)} حذف شود؟ این کار قابل بازگشت نیست.`,
        confirmLabel: 'حذف',
        destructive: true,
        onConfirm: () => {
          try {
            deleteTransaction(database, transaction.id);
            reload();
          } catch (error) {
            notify('خطا', toPersianErrorMessage(error, 'حذف انجام نشد'));
          }
        },
      });
    },
    [database, reload],
  );

  const handleChangeCategory = useCallback((transaction: TransactionWithCategory) => {
    categoryTargetRef.current = transaction;
    setCategoryTarget(transaction);
  }, []);

  const handleQuickCategorySelect = useCallback(
    (categoryId: number) => {
      const target = categoryTargetRef.current;
      categoryTargetRef.current = null;
      setCategoryTarget(null);
      if (!target || target.category_id === categoryId) {
        return;
      }
      try {
        // bank_account_id عمداً حذف می‌شود (undefined) تا لینک حساب بانکی حفظ بماند؛
        // اگر null می‌فرستادیم یعنی «این تراکنش دیگر بانکی نیست» و اثرش روی موجودی
        // حساب اشتباه برمی‌گشت. مبلغ/نوع/تاریخ/توضیح عیناً حفظ می‌شوند.
        updateTransaction(database, target.id, {
          amount: target.amount,
          type: target.type,
          category_id: categoryId,
          date: target.date,
          shamsi_date: target.shamsi_date,
          note: target.note,
        });
        reload();
      } catch (error) {
        notify('خطا', toPersianErrorMessage(error, 'تغییر دسته‌بندی انجام نشد'));
      }
    },
    [database, reload],
  );

  const handleDuplicate = useCallback(
    (transaction: TransactionWithCategory) => {
      if (transaction.category_id === null) {
        // createTransaction بدون دسته‌بندی خطا می‌دهد؛ به‌جای خطای مبهم، کاربر را
        // به انتخاب دسته هدایت می‌کنیم.
        notify(
          'تکرار نشد',
          'این تراکنش دسته‌بندی ندارد؛ اول با «تغییر سریع دسته‌بندی» یک دسته انتخاب کن.',
        );
        return;
      }

      const now = new Date();
      try {
        // کپی، تراکنش تازه‌ای با تاریخ امروز است؛ اگر تراکنش به حساب بانکی وصل بوده
        // همان حساب پاس می‌شود تا قاعده‌ی موجودی (لنگر حساب) در لایه‌ی داده اعمال شود.
        // برای تراکنش دستی، bank_account_id پاس نمی‌شود و موجودی هیچ حسابی دست نمی‌خورد.
        createTransaction(database, {
          amount: transaction.amount,
          type: transaction.type,
          category_id: transaction.category_id,
          date: toLocalIso(now),
          shamsi_date: formatShamsiShort(now),
          note: transaction.note,
          bank_account_id: transaction.bank_account_id ?? undefined,
        });
        reload();
      } catch (error) {
        notify('خطا', toPersianErrorMessage(error, 'تکرار تراکنش انجام نشد'));
      }
    },
    [database, reload],
  );

  const handleGateClose = useCallback(() => {
    setGateSkipped(true);
    setFocusSmsId(null);
  }, []);

  // ردیف‌ها memo شده‌اند؛ پس renderItem و جداکننده هم باید پایدار بمانند وگرنه
  // هر رندر داشبورد همه‌ی ردیف‌ها را دوباره می‌سازد.
  const renderTransaction = useCallback(
    ({ item }: { item: TransactionWithCategory }) => (
      <TransactionRow
        transaction={item}
        onSelect={handleEdit}
        onEdit={handleEdit}
        onChangeCategory={handleChangeCategory}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
    ),
    [handleChangeCategory, handleDelete, handleDuplicate, handleEdit],
  );

  const renderSeparator = useCallback(() => <View style={styles.separator} />, [styles]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <ScreenHeader
          title="داشبورد"
          subtitle={formatTodayLabel()}
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="حساب‌های بانکی"
                hitSlop={6}
                onPress={() => router.push('/banks')}
                style={styles.settingsButton}>
                <Ionicons name="card-outline" size={19} color={colors.textMuted} />
              </Pressable>
              <ThemeToggle />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="تنظیمات"
                hitSlop={6}
                onPress={() => router.push('/settings')}
                style={styles.settingsButton}>
                <Ionicons name="settings-outline" size={19} color={colors.textMuted} />
              </Pressable>
            </View>
          }
        />
        <RangeTabs value={range} options={DASHBOARD_RANGES} onChange={handleRangeChange} />
      </View>

      <View
        style={[styles.listArea, { transform: [{ translateX: filterSwipeOffset }] }]}
        // «تپ هرجای دیگر»: با شروع هر لمس روی ناحیه‌ی لیست، ردیف بازِ سوایپ‌شده بسته می‌شود
        onTouchStart={closeOpenTransactionRow}
        {...filterSwipe.panHandlers}>
        <FlatList
          ref={listRef}
          data={visibleTransactions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTransaction}
          ItemSeparatorComponent={renderSeparator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
          // شروع اسکرول عمودی هم کشوی باز ردیف‌ها را می‌بندد
          onScrollBeginDrag={closeOpenTransactionRow}
          // رندر تدریجی برای تاریخچه‌ی بزرگ: فقط چند ردیف اول ساخته می‌شود و بقیه
          // هنگام اسکرول. `removeClippedSubviews` روی اندروید پیش‌فرض است و برای
          // iOS (که با انیمیشن scale مشکل‌ساز می‌شود) روشن نمی‌شود.
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <BalanceHero
                summary={summary}
                rangeLabel={rangeLabel}
                caption={getRangeCaption(range)}
                includeBankBalance={includeBankBalance}
                baseBankBalance={baseBankBalance}
                onToggleBankBalance={() => {
                  setSetting(
                    database,
                    INCLUDE_BANK_BALANCE_IN_INCOME_KEY,
                    includeBankBalance ? '0' : '1',
                  );
                  reload();
                }}
              />

              {accounts.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/banks')}
                  style={styles.bankSummary}>
                  <View style={styles.bankSummaryIcon}>
                    <Ionicons name="wallet-outline" size={17} color={colors.primary} />
                  </View>
                  <View style={styles.bankSummaryTexts}>
                    <AppText variant="caption" style={styles.bankSummaryLabel}>
                      موجودی کل حساب‌های بانکی
                    </AppText>
                    <AppText variant="amountSmall">{`${formatAmount(totalBalance)} تومان`}</AppText>
                  </View>
                  <AppText variant="caption" style={styles.bankSummaryLabel}>
                    {`${toPersianDigits(accounts.length)} حساب`}
                  </AppText>
                  <Ionicons name="chevron-back" size={16} color={colors.textFaint} />
                </Pressable>
              ) : null}

              <GoalProgressCard
                income={monthSummary.income}
                expense={monthSummary.expense}
                incomeGoal={data?.incomeGoal ?? 0}
                expenseBudget={data?.expenseBudget ?? 0}
              />

              <View style={styles.filters}>
                <View style={styles.filterChips}>
                  {TYPE_FILTERS.map((option) => {
                    const active = option.value === typeFilter;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setTypeFilter(option.value)}
                        style={[styles.filterChip, active && styles.filterChipActive]}>
                        <AppText
                          variant="caption"
                          style={[styles.filterText, active && styles.filterTextActive]}>
                          {option.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`مرتب‌سازی: ${sortOption.label}`}
                  onPress={cycleSort}
                  style={styles.sortChip}>
                  <Ionicons name={sortOption.icon} size={13} color={colors.textMuted} />
                  <AppText variant="caption" style={styles.sortText}>
                    {sortOption.label}
                  </AppText>
                </Pressable>
              </View>

              {/* ردیف دوم: فیلترهای سریع؛ فقط یکی هم‌زمان فعال است و «همه» پاکش می‌کند */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.quickChips}
                contentContainerStyle={styles.quickChipsRow}>
                {QUICK_FILTERS.map((option) => {
                  const active = option.value === quickFilter;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleQuickFilterChange(option.value)}
                      style={[styles.quickChip, active && styles.quickChipActive]}>
                      <AppText
                        variant="caption"
                        style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {pendingSms.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    // باز کردن دستی صف، تمرکز پیامکِ قبلی را پاک می‌کند
                    setFocusSmsId(null);
                    setGateSkipped(false);
                  }}
                  style={styles.pendingBanner}>
                  <Ionicons name="mail-unread-outline" size={16} color={colors.warning} />
                  <AppText variant="caption" style={styles.pendingBannerText}>
                    {`${toPersianDigits(pendingSms.length)} تراکنش از پیامک منتظر تایید است`}
                  </AppText>
                  <Ionicons name="chevron-back" size={14} color={colors.warning} />
                </Pressable>
              ) : null}

              <View style={styles.listTitleRow}>
                <AppText variant="subtitle">تراکنش‌ها</AppText>
                <AppText variant="caption" style={styles.countText}>
                  {`${toPersianDigits(visibleTransactions.length)} مورد`}
                </AppText>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={transactions.length > 0 ? 'با این فیلتر چیزی نیست' : 'در این بازه تراکنشی ثبت نشده'}
              message={
                transactions.length > 0
                  ? 'فیلتر نوع یا فیلترهای سریع را عوض کن یا «همه» را انتخاب کن.'
                  : 'با دکمه‌ی + یک درآمد یا هزینه‌ی جدید ثبت کن.'
              }
              actionLabel={transactions.length > 0 ? undefined : 'ثبت تراکنش'}
              onActionPress={transactions.length > 0 ? undefined : () => router.navigate('/add')}
            />
          }
        />
      </View>

      {/* focusSmsId پیامکی را که نوتیفیکیشن/لینک عمیق خواسته، مستقیم در صف باز می‌کند */}
      <PendingSmsGateModal
        focusSmsId={focusSmsId}
        visible={pendingSms.length > 0 && !gateSkipped}
        items={pendingSms}
        accounts={accounts}
        categories={data?.categories ?? []}
        onClose={handleGateClose}
        onChanged={reload}
      />

      <QuickCategorySheet
        visible={categoryTarget !== null}
        transaction={categoryTarget}
        categories={data?.categories ?? []}
        onClose={() => setCategoryTarget(null)}
        onSelect={handleQuickCategorySelect}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ثبت تراکنش جدید"
        onPress={() => router.navigate('/add')}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.md,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 110,
    },
    // ناحیه‌ی لیست: گیرنده‌ی سوایپ افقی تغییر حالت + کلیپِ جابه‌جایی بازخوردی
    listArea: {
      flex: 1,
      overflow: 'hidden',
    },
    listHeader: {
      gap: spacing.lg,
      marginBottom: spacing.sm,
    },
    bankSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    bankSummaryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    bankSummaryTexts: { flex: 1, gap: 1 },
    bankSummaryLabel: { color: colors.textMuted },
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pendingBannerText: { flex: 1, color: colors.warning },
    filters: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    filterChips: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
    },
    filterChipActive: {
      backgroundColor: colors.primarySoft,
    },
    filterText: {
      color: colors.textMuted,
    },
    filterTextActive: {
      color: colors.primary,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    sortText: {
      color: colors.textMuted,
    },
    quickChips: {
      flexGrow: 0,
    },
    quickChipsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingVertical: 2,
    },
    quickChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 1,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quickChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    quickChipText: {
      color: colors.textMuted,
    },
    quickChipTextActive: {
      color: colors.primary,
    },
    listTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    countText: {
      color: colors.textFaint,
    },
    separator: {
      height: spacing.sm,
    },
    fab: {
      position: 'absolute',
      bottom: spacing.xl,
      left: spacing.lg,
      width: 58,
      height: 58,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    fabPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    sheetOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      maxHeight: '72%',
      gap: spacing.md,
    },
    sheetHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sheetHeaderTexts: {
      flex: 1,
      minWidth: 0,
    },
    sheetSubtitle: {
      marginTop: 2,
      color: colors.textMuted,
    },
    sheetCloseButton: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    sheetScroll: {
      flexShrink: 1,
    },
    sheetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    sheetTile: {
      flexBasis: '30%',
      flexGrow: 1,
      maxWidth: '32%',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.xs,
      gap: spacing.xs,
    },
    sheetTileIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetTileLabel: {
      color: colors.text,
      textAlign: 'center',
    },
  });
