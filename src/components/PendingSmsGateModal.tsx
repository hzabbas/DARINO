import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDatabase } from '../db/DatabaseProvider';
import { createCategory } from '../db/categories';
import {
  approvePendingSms,
  clearPendingSmsQueue,
  countPendingSmsBefore,
  ignorePendingSms,
  ignorePendingSmsBefore,
  mergePendingSmsWithTransaction,
} from '../db/pendingSms';
import { findDuplicateCandidates, getCategoryTotals } from '../db/transactions';
import { useFocusScroll } from '../hooks/useFocusScroll';
import { useKeyboardPadding } from '../hooks/useKeyboard';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { BankAccount, Category, PendingSms, TransactionType } from '../types/models';
import { directionForInput, isolateLtr } from '../utils/bidi';
import { formatAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { confirmAction, notify } from '../utils/dialogs';
import { toPersianErrorMessage } from '../utils/errors';
import { getBank } from '../utils/iranianBanks';
import { formatAmountInWords } from '../utils/numberToWords';
import { AppText } from './AppText';
import { BankLogo } from './BankLogo';

interface PendingSmsGateModalProps {
  visible: boolean;
  items: PendingSms[];
  accounts: BankAccount[];
  categories: Category[];
  /**
   * اگر مقدار داشته باشد، مودال روی همین پیامک (`sms_id`) باز می‌شود، نه روی
   * اولین صف؛ برای وقتی که کاربر روی نوتیفیکیشن یک پیامک مشخص زده است.
   */
  focusSmsId?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

type Action = 'expense' | 'income' | null;

/** آستانه‌ی سوایپ؛ کمتر از این مقدار «کشیدن» نیست و کاروسل را جابه‌جا نمی‌کند. */
const SWIPE_THRESHOLD = 40;

/**
 * تا وقتی حرکت افقی واضح نباشد کاروسل فعال نمی‌شود؛ این عدد جلوی بلعیدن لمس
 * چیپ‌ها/دکمه‌ها و خراب‌کردن اسکرول عمودی را می‌گیرد.
 */
const SWIPE_ACTIVATE = 14;

/** شش تا هشت آیکون کافی است تا فرم ساخت سریع دسته‌بندی، سریع بماند. */
const CREATE_ICONS: readonly (keyof typeof Ionicons.glyphMap)[] = [
  'cart-outline',
  'restaurant-outline',
  'car-outline',
  'home-outline',
  'receipt-outline',
  'cash-outline',
  'gift-outline',
  'fitness-outline',
];

/** رنگ دسته‌ی تازه چرخشی انتخاب می‌شود تا فرم ساخت، بدون انتخاب رنگ، سریع بماند. */
const CREATE_COLORS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#10B981',
  '#0EA5E9',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
];

/**
 * صندوق تایید سریع: قبل از ورود به داشبورد، هر پیامک کشف‌شده را با یک لمس
 * به هزینه/درآمد/انتقال تبدیل می‌کند یا نادیده می‌گیرد.
 *
 * قاعده‌های طراحی این نسخه:
 *  - هیچ دسته‌بندی‌ای پشت `slice` پنهان نمی‌ماند: پیشنهاد/پرتکرار بالا می‌آید و
 *    همه‌ی دسته‌ها داخل یک لیست اسکرولی قابل دسترس‌اند.
 *  - پیامک فعلی همیشه با `id` حل می‌شود (صف از دیتابیس دوباره خوانده می‌شود)؛
 *    اگر وسط کار حذف شود، به جای پرش تصادفی به جایگاه کلمپ‌شده می‌رویم.
 *  - تراکنش مشابه (هم‌مبلغ در همان پنجره‌ی زمانی) بالای همه چیز هشدار می‌دهد،
 *    چون ثبت دوباره‌ی هزینه‌ای که کاربر دستی وارد کرده، اصلِ درد همین مودال است.
 */
export function PendingSmsGateModal({
  visible,
  items,
  accounts,
  categories,
  focusSmsId = null,
  onClose,
  onChanged,
}: PendingSmsGateModalProps) {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // روی اندروید دیالوگ بومی از adjustResize پیروی نمی‌کند؛ پس فاصله‌ی پایین
  // محتوا را خودمان می‌دهیم و فوکوس ورودی را هم اسکرول می‌کنیم (useFocusScroll).
  const keyboardPadding = useKeyboardPadding();
  const focusScroll = useFocusScroll();

  const [action, setAction] = useState<Action>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  /** پیش‌فرض روشن است تا رفتار «لمس دسته = ثبت فوری» امروز حفظ شود. */
  const [singleTap, setSingleTap] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [lastCreatedCategory, setLastCreatedCategory] = useState<Category | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createIcon, setCreateIcon] = useState<keyof typeof Ionicons.glyphMap>('cart-outline');
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** با هر تغییر دیتابیسی که خودمان می‌زنیم یک پله بالا می‌رود تا کوئری‌ها تازه شوند. */
  const [dataRevision, setDataRevision] = useState(0);

  /** آخرین جایگاهی که کاربر در صف دیده بود؛ مبنای «بعدی» بعد از حذف پیامک فعلی. */
  const lastIndexRef = useRef(0);
  /** آخرین focusSmsId‌ای که یک بار رویش پریدیم (تا ناوبری دستی را خراب نکنیم). */
  const focusAppliedRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(false);

  const notifyChanged = () => {
    setDataRevision((value) => value + 1);
    onChanged();
  };

  const currentIndex = items.findIndex((item) => item.id === currentId);
  // پیامک فعلی همیشه با id حل می‌شود؛ اگر دیگر در صف نباشد (تایید/رد شده)،
  // جایگاه قبلیِ کلمپ‌شده به ما می‌گوید کدام پیامک حالا «فعلی» است.
  const index = currentIndex >= 0 ? currentIndex : Math.min(lastIndexRef.current, Math.max(0, items.length - 1));

  const current = items[index] ?? null;
  const account = accounts.find((item) => item.id === current?.bank_account_id) ?? null;
  const bank = current ? getBank(account?.bank_code ?? 'other') : null;

  const isTransfer = current?.detected_type === 'transfer';
  const effectiveAction: Action =
    action ?? (isTransfer ? null : current?.detected_type === 'income' ? 'income' : 'expense');
  const actionType: TransactionType = effectiveAction ?? 'expense';

  // دسته‌بندی پیشنهادی سیستم (بر اساس تاریخچه‌ی همین فروشنده یا کلیدواژه‌ی پیامک)؛
  // فقط وقتی با نوع فعلی (هزینه/درآمد) هم‌خوان باشد پیشنهاد می‌شود.
  const suggestedCategory =
    current?.suggested_category_id && effectiveAction
      ? categories.find(
          (category) =>
            category.id === current.suggested_category_id && category.type === effectiveAction,
        ) ?? null
      : null;

  useEffect(() => {
    if (currentIndex >= 0) {
      lastIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  // «باز شدن روی پیامکی که کاربر از نوتیفیکیشن انتخاب کرده»: در هر باز شدن (یا با
  // عوض شدن focusSmsId) فقط یک بار می‌پریم تا ناوبری دستی کاربر را خراب نکنیم.
  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    const justOpened = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!focusSmsId) return;
    if (!justOpened && focusAppliedRef.current === focusSmsId) return;

    const target = items.find((item) => item.sms_id === focusSmsId);
    if (!target) return; // هنوز در صف نیست؛ با رسیدنش دوباره تلاش می‌شود
    focusAppliedRef.current = focusSmsId;
    setCurrentId(target.id);
  }, [visible, focusSmsId, items]);

  // با تغییر پیامک فعلی، انتخاب‌های پیامک قبلی نباید روی پیامک جدید بمانند.
  useEffect(() => {
    setAction(null);
    setShowRaw(false);
    setSelectedCategoryId(null);
    setCreateOpen(false);
    setCreateName('');
    setCreateError(null);
    setActionError(null);
  }, [current?.id]);

  // با عوض شدن نوع (هزینه/درآمد) دسته‌ی انتخاب‌شده و فرم ساخت جدید بی‌معنا می‌شوند.
  useEffect(() => {
    setSelectedCategoryId(null);
    setCreateOpen(false);
    setCreateError(null);
    setCreateIcon(effectiveAction === 'income' ? 'cash-outline' : 'cart-outline');
  }, [effectiveAction]);

  // مصرف واقعی دسته‌ها (کل زمان‌ها) برای رتبه‌بندی «پرتکرار»ها.
  const usageTotals = useMemo(
    () => getCategoryTotals(database, null, actionType),
    [database, actionType, dataRevision],
  );

  const frequentCategories = useMemo(() => {
    // اول به تعداد استفاده، و اگر برابر بود به جمع مبلغ؛ همان دسته‌هایی که
    // کاربر واقعاً زیاد استفاده می‌کند بالای لیست بیایند.
    const ranked = [...usageTotals].sort((a, b) => b.count - a.count || b.total - a.total);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const list: Category[] = [];
    for (const row of ranked) {
      if (list.length >= 6) break;
      if (row.category_id === null) continue;
      const category = byId.get(row.category_id);
      if (category && !list.some((item) => item.id === category.id)) {
        list.push(category);
      }
    }
    return list;
  }, [usageTotals, categories]);

  const recommendedCategories = useMemo(() => {
    // پیشنهاد سیستم اول، بعد پرتکرارها؛ سقف شش چیپ تا بخش بالا شلوغ نشود.
    const list: Category[] = [];
    if (suggestedCategory) list.push(suggestedCategory);
    for (const category of frequentCategories) {
      if (list.length >= 6) break;
      if (!list.some((item) => item.id === category.id)) list.push(category);
    }
    return list;
  }, [suggestedCategory, frequentCategories]);

  const allTypeCategories = useMemo(
    () => categories.filter((category) => category.type === actionType),
    [categories, actionType],
  );

  // تراکنش مشابه: هم‌مبلغ و هم‌نوع، در پنجره‌ی ۳۶ ساعته‌ی اطراف تاریخ پیامک.
  // برای انتقال‌ها معنا ندارد، پس کلاً رد می‌شود.
  const duplicateCandidates = useMemo(() => {
    if (!current || current.detected_type === 'transfer') return [];
    return findDuplicateCandidates(database, {
      amount: current.amount,
      type: current.detected_type === 'income' ? 'income' : 'expense',
      dateIso: current.date,
      windowHours: 36,
    });
  }, [database, current?.id, current?.amount, current?.detected_type, current?.date, dataRevision]);

  const mergeCandidate = duplicateCandidates[0] ?? null;

  /**
   * نیمه‌شب محلیِ روز جدیدترین پیامک صف.
   * تاریخ‌ها محلی ذخیره می‌شوند (`toLocalIso`)؛ پس مرز «امروز» هم باید با ساعت
   * محلی ساخته شود، وگرنه نزدیک نیمه‌شب، پیامک‌های همان روز هم اشتباهی رد می‌شوند.
   */
  const startOfToday = useMemo(() => {
    let newest = 0;
    for (const item of items) {
      const timestamp = new Date(item.date).getTime();
      if (Number.isFinite(timestamp) && timestamp > newest) newest = timestamp;
    }
    const base = newest > 0 ? new Date(newest) : new Date();
    base.setHours(0, 0, 0, 0);
    return base.getTime();
  }, [items]);

  const oldPendingCount = useMemo(
    () => countPendingSmsBefore(database, startOfToday),
    [database, startOfToday, dataRevision],
  );

  const selectedCategory = useMemo(() => {
    if (selectedCategoryId === null) return null;
    const found = categories.find((category) => category.id === selectedCategoryId);
    if (found) return found;
    // دسته‌ی تازه‌ساخته‌شده ممکن است هنوز در props والد تازه نشده باشد.
    if (lastCreatedCategory && lastCreatedCategory.id === selectedCategoryId) return lastCreatedCategory;
    return null;
  }, [categories, selectedCategoryId, lastCreatedCategory]);

  // در حالت تک‌ضربه‌ای، دکمه‌ی تایید همان میان‌بر پیشنهاد سیستم است؛ در حالت مرور
  // فقط چیپی که انتخاب شده قابل تایید است.
  const confirmCategory = singleTap ? suggestedCategory : selectedCategory;

  const goToRelative = (step: number) => {
    // چرخش کامل (wrap-around) تا وقتی صف کوچک می‌شود هیچ دکمه‌ای بی‌اثر نماند.
    if (items.length < 2) return;
    const nextIndex = (((index + step) % items.length) + items.length) % items.length;
    setCurrentId(items[nextIndex].id);
  };

  /** رفتن به پیامک بعدی در همان ترتیبی که صف الان دارد. */
  const advanceAfterHandled = (handledId: number) => {
    const remaining = items.filter((item) => item.id !== handledId);
    if (remaining.length === 0) {
      // صف تمام شد؛ مودال را می‌بندیم تا کاربر به داشبورد برگردد.
      onClose();
      return;
    }
    const handledIndex = items.findIndex((item) => item.id === handledId);
    const nextIndex = Math.min(Math.max(handledIndex, 0), remaining.length - 1);
    setCurrentId(remaining[nextIndex].id);
  };

  const approve = (categoryId?: number) => {
    if (!current) return;
    try {
      approvePendingSms(database, { id: current.id, categoryId: categoryId ?? null });
      notifyChanged();
      advanceAfterHandled(current.id);
    } catch (error) {
      setActionError(toPersianErrorMessage(error, 'ثبت پیامک ناموفق بود'));
    }
  };

  const ignore = () => {
    if (!current) return;
    ignorePendingSms(database, current.id);
    notifyChanged();
    advanceAfterHandled(current.id);
  };

  /**
   * مسیر واحد «لمس دسته‌بندی»: در حالت تک‌ضربه‌ای همان لحظه ثبت و بعدی باز
   * می‌شود؛ در حالت مرور فقط انتخاب می‌شود تا دکمه‌ی تایید فشار داده شود.
   */
  const onCategoryPress = (categoryId: number) => {
    if (singleTap) {
      approve(categoryId);
      return;
    }
    setSelectedCategoryId(categoryId);
  };

  const submitNewCategory = () => {
    const name = createName.trim();
    if (!name) {
      // به‌جای پرتاب خطای دیتابیس، همان‌جا پیام فارسی نشان بده تا کاربر بفهمد چه کم است.
      setCreateError('نام دسته‌بندی را وارد کن');
      return;
    }

    try {
      const sameTypeCount = categories.filter((category) => category.type === actionType).length;
      const color = CREATE_COLORS[sameTypeCount % CREATE_COLORS.length];
      const id = createCategory(database, { name, type: actionType, icon: createIcon, color });
      setLastCreatedCategory({ id, name, type: actionType, icon: createIcon, color });
      notifyChanged();
      setCreateOpen(false);
      setCreateName('');
      setCreateError(null);
      // مثل لمس همان چیپ رفتار می‌کنیم: در حالت تک‌ضربه‌ای همان‌جا ثبت می‌شود و
      // در حالت مرور، دسته‌ی جدید انتخاب می‌ماند تا دکمه‌ی تایید فشار داده شود.
      onCategoryPress(id);
    } catch (error) {
      setCreateError(toPersianErrorMessage(error, 'ساخت دسته‌بندی ناموفق بود'));
    }
  };

  const mergeWithCandidate = (candidateId: number) => {
    if (!current) return;
    try {
      const result = mergePendingSmsWithTransaction(database, {
        pendingId: current.id,
        transactionId: candidateId,
      });
      if (!result.merged) {
        // پیامک یا تراکنش دیگر قابل ادغام نیست (مثلاً همین حالا بررسی شده است).
        setActionError('ادغام انجام نشد؛ شاید این پیامک از قبل بررسی شده باشد');
        notifyChanged();
        return;
      }
      notifyChanged();
      advanceAfterHandled(current.id);
    } catch (error) {
      setActionError(toPersianErrorMessage(error, 'ادغام ناموفق بود'));
    }
  };

  const dismissOldPending = () => {
    confirmAction({
      title: 'رد کردن پیامک‌های قدیمی؟',
      message: `${toPersianDigits(oldPendingCount)} پیامک قدیمی‌تر از امروز نادیده گرفته می‌شود و از صف تایید خارج می‌شود.`,
      confirmLabel: 'رد کردن',
      destructive: true,
      onConfirm: () => {
        const dismissed = ignorePendingSmsBefore(database, startOfToday);
        notify('پیامک‌های قدیمی رد شد', `${toPersianDigits(dismissed)} مورد از صف تایید خارج شد`);
        notifyChanged();
      },
    });
  };

  const dismissAllPending = () => {
    confirmAction({
      title: 'پاکسازی کل صف؟',
      message: `${toPersianDigits(items.length)} پیامک منتظر تایید پاک می‌شود. تراکنش‌های ثبت‌شده دست‌نخورده می‌مانند.`,
      confirmLabel: 'رد کردن همه',
      destructive: true,
      onConfirm: () => {
        clearPendingSmsQueue(database);
        notifyChanged();
        onClose();
      },
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // فقط کشیدن افقی واضح کاروسل را می‌گیرد؛ لمس چیپ‌ها/دکمه‌های روی کارت و
        // اسکرول عمودی صفحه هرگز بلعیده نمی‌شوند.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) < SWIPE_THRESHOLD) return;
          if (Math.abs(gesture.dx) < Math.abs(gesture.dy)) return;
          // RTL: کشیدن به راست یعنی «قبلی» و کشیدن به چپ یعنی «بعدی».
          if (gesture.dx > 0) goToRelative(-1);
          else goToRelative(1);
        },
      }),
    // وابستگی‌های واقعی همان چیزهایی است که goToRelative می‌خواند.
    [index, items],
  );

  if (!current || !bank) {
    return null;
  }

  const renderCategoryChip = (category: Category, isSuggested: boolean) => {
    const isSelected = !singleTap && selectedCategoryId === category.id;
    return (
      <Pressable
        key={category.id}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`دسته‌بندی ${category.name}`}
        onPress={() => onCategoryPress(category.id)}
        style={[
          styles.categoryChip,
          { borderColor: `${category.color}55` },
          isSuggested && styles.categoryChipSuggested,
          isSelected && { borderColor: category.color, backgroundColor: `${category.color}1F` },
        ]}>
        <View style={[styles.categoryDot, { backgroundColor: `${category.color}22` }]}>
          <Ionicons
            name={category.icon as keyof typeof Ionicons.glyphMap}
            size={13}
            color={category.color}
          />
        </View>
        {/* numberOfLines + flexShrink: متن هرچقدر هم بلند باشد داخل قاب گرد می‌ماند */}
        <AppText variant="caption" numberOfLines={2} style={styles.categoryText}>
          {category.name}
        </AppText>
        {isSuggested ? (
          <AppText variant="caption" style={styles.suggestedBadge}>
            پیشنهاد
          </AppText>
        ) : null}
        {isSelected ? <Ionicons name="checkmark" size={13} color={category.color} /> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            <AppText variant="title">تایید سریع</AppText>
            <AppText variant="caption" style={styles.muted}>
              {`${toPersianDigits(items.length)} تراکنش خودکار کشف شد`}
            </AppText>
          </View>
          <Pressable onPress={onClose} style={styles.skipButton} accessibilityRole="button">
            <AppText variant="caption" style={styles.skipText}>
              رد کردن و ورود
            </AppText>
            <Ionicons name="arrow-back" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {/* ناوبری کاروسل: در RTL «قبلی» سمت راست با فلش رو به راست می‌آید تا با
            جهت سوایپ (کشیدن به راست = قبلی) هم‌خوان باشد. */}
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="پیامک قبلی"
            accessibilityState={{ disabled: items.length < 2 }}
            disabled={items.length < 2}
            onPress={() => goToRelative(-1)}
            style={[styles.navButton, items.length < 2 && styles.navButtonDisabled]}>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
            <AppText variant="caption" style={styles.navButtonText}>
              قبلی
            </AppText>
          </Pressable>
          <AppText variant="caption" style={styles.muted}>
            {`${toPersianDigits(index + 1)} از ${toPersianDigits(items.length)}`}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="پیامک بعدی"
            accessibilityState={{ disabled: items.length < 2 }}
            disabled={items.length < 2}
            onPress={() => goToRelative(1)}
            style={[styles.navButton, items.length < 2 && styles.navButtonDisabled]}>
            <AppText variant="caption" style={styles.navButtonText}>
              بعدی
            </AppText>
            <Ionicons name="chevron-back" size={15} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          ref={focusScroll.scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + keyboardPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {actionError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.expense} />
              <AppText variant="caption" style={styles.errorText}>
                {actionError}
              </AppText>
            </View>
          ) : null}

          {/* هشدار تکرار بالای همه چیز: هدف اصلی این مودال، جلوگیری از ثبت دوباره‌ی
              هزینه‌ای است که کاربر قبلاً دستی وارد کرده. */}
          {mergeCandidate ? (
            <View style={styles.duplicateCard}>
              <View style={styles.duplicateHeader}>
                <Ionicons name="warning-outline" size={17} color={colors.warning} />
                <AppText variant="label" tone="warning">
                  تراکنش تکراری؟
                </AppText>
              </View>
              <AppText variant="caption" style={styles.duplicateText} numberOfLines={3}>
                {`تراکنش مشابه در تاریخ ${mergeCandidate.shamsi_date} ثبت شده است (${mergeCandidate.category_name ?? 'بدون دسته‌بندی'})`}
              </AppText>
              <AppText variant="caption" style={styles.duplicateText}>
                {`مبلغ مشابه: ${formatAmount(mergeCandidate.amount)} تومان`}
              </AppText>
              {duplicateCandidates.length > 1 ? (
                <AppText variant="caption" style={styles.muted}>
                  {`و ${toPersianDigits(duplicateCandidates.length - 1)} تراکنش هم‌مبلغ دیگر در همان بازه‌ی زمانی`}
                </AppText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => mergeWithCandidate(mergeCandidate.id)}
                style={styles.primaryButton}>
                <Ionicons name="git-merge-outline" size={17} color={colors.white} />
                <AppText variant="caption" style={styles.primaryText} numberOfLines={2}>
                  ادغام با تراکنش قبلی (جلوگیری از ثبت تکراری)
                </AppText>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card} {...panResponder.panHandlers}>
            <View style={styles.bankRow}>
              <BankLogo code={bank.code} size={46} />
              <View style={styles.bankTexts}>
                <AppText variant="label">{account?.title ?? bank.name}</AppText>
                <AppText variant="caption" style={styles.muted}>
                  {`${bank.name} · ${isolateLtr(current.sender)}`}
                </AppText>
              </View>
              <View
                style={[
                  styles.typePill,
                  {
                    backgroundColor:
                      current.detected_type === 'income'
                        ? colors.incomeSoft
                        : current.detected_type === 'transfer'
                          ? `${colors.primary}1A`
                          : colors.expenseSoft,
                  },
                ]}>
                <AppText
                  variant="caption"
                  style={{
                    color:
                      current.detected_type === 'income'
                        ? colors.income
                        : current.detected_type === 'transfer'
                          ? colors.primary
                          : colors.expense,
                  }}>
                  {current.detected_type === 'income'
                    ? 'واریز'
                    : current.detected_type === 'transfer'
                      ? 'انتقال'
                      : 'برداشت'}
                </AppText>
              </View>
            </View>

            <AppText variant="display" style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
              {`${current.detected_type === 'income' ? '+' : current.detected_type === 'transfer' ? '' : '−'}${formatAmount(current.amount)}`}
            </AppText>
            {/* عدد با حروف، تا کاربر قبل از تایید مطمئن شود تعداد صفرها درست است */}
            <AppText variant="caption" style={styles.amountWords} numberOfLines={2}>
              {formatAmountInWords(current.amount)}
            </AppText>
            <AppText variant="caption" style={styles.dateTimeText} numberOfLines={1}>
              {current.time ? `${current.shamsi_date} • ${current.time}` : current.shamsi_date}
            </AppText>

            {current.merchant ? (
              <View style={styles.merchantRow}>
                <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
                <AppText variant="caption" style={styles.muted} numberOfLines={1}>
                  {`فروشنده: ${current.merchant}`}
                </AppText>
              </View>
            ) : null}

            {current.detected_balance !== null ? (
              <View style={styles.balanceRow}>
                <Ionicons name="card-outline" size={14} color={colors.textMuted} />
                <AppText variant="caption" style={styles.muted}>
                  {`موجودی جدید بانک: ${formatAmount(current.detected_balance)} تومان`}
                </AppText>
              </View>
            ) : null}

            {current.roundup_amount > 0 ? (
              <AppText variant="caption" style={styles.muted}>
                {`رند بلوبانک: ${formatAmount(current.roundup_amount)} تومان`}
              </AppText>
            ) : null}

            {current.detected_type === 'transfer' ? (
              <View style={styles.transferBox}>
                <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
                <AppText variant="caption" style={styles.transferText}>
                  {current.fee_amount > 0
                    ? `انتقال بین حساب‌های خودت؛ کارمزد ${formatAmount(current.fee_amount)} تومان`
                    : 'انتقال بین حساب‌های خودت؛ بدون کارمزد'}
                </AppText>
              </View>
            ) : null}

            <Pressable onPress={() => setShowRaw((value) => !value)} style={styles.rawToggle}>
              <Ionicons name={showRaw ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              <AppText variant="caption" style={styles.muted}>
                متن اصلی پیامک
              </AppText>
            </Pressable>
            {showRaw ? (
              <View style={styles.rawBox}>
                <AppText variant="caption" style={styles.rawText}>
                  {current.raw_body}
                </AppText>
              </View>
            ) : null}
          </View>

          {current.detected_type === 'transfer' ? (
            <Pressable onPress={() => approve()} style={styles.primaryButton}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
              <AppText variant="caption" style={styles.primaryText}>
                ثبت انتقال (بدون تاثیر در دخل‌وخرج)
              </AppText>
            </Pressable>
          ) : (
            <>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => setAction('expense')}
                  style={[styles.actionChip, effectiveAction === 'expense' && styles.actionChipActiveExpense]}>
                  <Ionicons name="arrow-up-circle-outline" size={16} color={colors.expense} />
                  <AppText variant="caption" style={styles.expenseText}>
                    هزینه
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => setAction('income')}
                  style={[styles.actionChip, effectiveAction === 'income' && styles.actionChipActiveIncome]}>
                  <Ionicons name="arrow-down-circle-outline" size={16} color={colors.income} />
                  <AppText variant="caption" style={{ color: colors.income }}>
                    درآمد
                  </AppText>
                </Pressable>
              </View>

              <AppText variant="caption" style={styles.muted}>
                دسته‌بندی را انتخاب کن:
              </AppText>

              {suggestedCategory ? (
                <View style={styles.suggestionBox}>
                  <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
                  <AppText variant="caption" style={styles.suggestionText} numberOfLines={2}>
                    {`پیشنهاد سیستم: «${suggestedCategory.name}»`}
                    {current.merchant ? ' — بر اساس تراکنش‌های قبلی همین فروشنده' : ''}
                  </AppText>
                </View>
              ) : null}

              {recommendedCategories.length > 0 ? (
                <View style={styles.section}>
                  <AppText variant="caption" style={styles.sectionTitle}>
                    پرتکرار و پیشنهادی
                  </AppText>
                  <View style={styles.categoryGrid}>
                    {recommendedCategories.map((category) =>
                      renderCategoryChip(category, category.id === suggestedCategory?.id),
                    )}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <AppText variant="caption" style={styles.sectionTitle}>
                  همه دسته‌بندی‌ها
                </AppText>
                {/* کل دسته‌ها داخل ارتفاع محدود می‌مانند تا بقیه‌ی صفحه زیر آن‌ها پنهان
                    نشود؛ نستد اسکرول برای اندروید لازم است. */}
                <ScrollView
                  style={styles.allCategoriesScroll}
                  contentContainerStyle={styles.categoryGrid}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ساخت دسته‌بندی جدید"
                    onPress={() => {
                      setCreateOpen((open) => !open);
                      setCreateError(null);
                    }}
                    style={[
                      styles.categoryChip,
                      styles.newCategoryChip,
                      createOpen && styles.newCategoryChipActive,
                    ]}>
                    <Ionicons name="add" size={14} color={colors.primary} />
                    <AppText variant="caption" numberOfLines={1} style={styles.newCategoryText}>
                      دسته‌بندی جدید
                    </AppText>
                  </Pressable>
                  {allTypeCategories.map((category) =>
                    renderCategoryChip(category, category.id === suggestedCategory?.id),
                  )}
                </ScrollView>

                {createOpen ? (
                  <View style={styles.createRow}>
                    <TextInput
                      value={createName}
                      onChangeText={(text) => {
                        setCreateName(text);
                        setCreateError(null);
                      }}
                      onFocus={focusScroll.onFocus}
                      onSubmitEditing={submitNewCategory}
                      returnKeyType="done"
                      placeholder="مثلاً خرید کتاب"
                      placeholderTextColor={colors.textFaint}
                      selectionColor={colors.primary}
                      accessibilityLabel="نام دسته‌بندی جدید"
                      style={[
                        styles.createInput,
                        { writingDirection: directionForInput(createName, 'مثلاً خرید کتاب') },
                      ]}
                    />
                    <View style={styles.iconChoices}>
                      {CREATE_ICONS.map((icon) => {
                        const isChosen = icon === createIcon;
                        return (
                          <Pressable
                            key={icon}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isChosen }}
                            onPress={() => setCreateIcon(icon)}
                            style={[
                              styles.iconChoice,
                              isChosen && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                            ]}>
                            <Ionicons
                              name={icon}
                              size={17}
                              color={isChosen ? colors.primary : colors.textMuted}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={submitNewCategory}
                      style={styles.createButton}>
                      <Ionicons name="checkmark" size={15} color={colors.white} />
                      <AppText variant="caption" style={styles.primaryText}>
                        ساخت
                      </AppText>
                    </Pressable>
                    {createError ? (
                      <View style={styles.errorBox}>
                        <Ionicons name="alert-circle-outline" size={15} color={colors.expense} />
                        <AppText variant="caption" style={styles.errorText}>
                          {createError}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </>
          )}

          {!isTransfer && confirmCategory ? (
            <Pressable
              onPress={() => {
                if (confirmCategory) approve(confirmCategory.id);
              }}
              style={styles.primaryButton}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
              <AppText variant="caption" style={styles.primaryText} numberOfLines={2}>
                {`تایید و ثبت در «${confirmCategory.name}»`}
              </AppText>
            </Pressable>
          ) : null}

          <Pressable onPress={ignore} style={styles.ignoreButton}>
            <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" style={styles.muted}>
              نادیده گرفتن این پیامک
            </AppText>
          </Pressable>

          <View style={styles.quickModesCard}>
            <AppText variant="caption" style={styles.sectionTitle}>
              حالت‌های سریع
            </AppText>

            {/* سوییچ خودش لمس نمی‌گیرد (pointerEvents: none) و کل ردیف تاگل است؛
                این‌طوری لمس دوباره‌ی روی سوییچ باعث تاگل دوباره نمی‌شود. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: singleTap }}
              accessibilityLabel="ثبت تک‌ضربه‌ای"
              onPress={() => setSingleTap((value) => !value)}
              style={styles.quickRow}>
              <Switch
                pointerEvents="none"
                value={singleTap}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
              <View style={styles.quickTexts}>
                <AppText variant="label">ثبت تک‌ضربه‌ای</AppText>
                <AppText variant="caption" style={styles.muted}>
                  با زدن روی دسته‌بندی بلافاصله ثبت و بعدی باز شود
                </AppText>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: oldPendingCount === 0 }}
              disabled={oldPendingCount === 0}
              onPress={dismissOldPending}
              style={[styles.quickAction, oldPendingCount === 0 && styles.quickActionDisabled]}>
              <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
              <AppText variant="caption" style={styles.muted} numberOfLines={2}>
                رد کردن پیامک‌های قدیمی‌تر از امروز
              </AppText>
              <AppText variant="caption" style={styles.muted}>
                {`(${toPersianDigits(oldPendingCount)})`}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={dismissAllPending}
              style={styles.quickAction}>
              <Ionicons name="trash-outline" size={15} color={colors.expense} />
              <AppText variant="caption" style={styles.expenseText} numberOfLines={2}>
                رد کردن همه (پاکسازی صف)
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerTexts: { gap: 2 },
    muted: { color: colors.textMuted },
    skipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    skipText: { color: colors.primary },
    navRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    navButton: {
      // «row-reverse» یعنی خط راست‌به‌چپ؛ «قبلی» فرزند اول و سمت راست است.
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    navButtonDisabled: { opacity: 0.4 },
    navButtonText: { color: colors.primary },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    section: { gap: spacing.xs },
    sectionTitle: { color: colors.textMuted },
    errorBox: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.expenseSoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    errorText: { color: colors.expense, flexShrink: 1 },
    duplicateCard: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${colors.warning}55`,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    duplicateHeader: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
    },
    duplicateText: { color: colors.text, lineHeight: 20 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    bankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bankTexts: { flex: 1, gap: 1 },
    typePill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    amount: { marginTop: spacing.xs },
    amountWords: { color: colors.textMuted, textAlign: 'right', lineHeight: 22 },
    dateTimeText: { color: colors.textMuted, textAlign: 'right', writingDirection: 'ltr' },
    merchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    transferBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginTop: spacing.xs,
    },
    transferText: { flex: 1, color: colors.primary },
    rawToggle: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: spacing.xs },
    rawBox: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
    },
    rawText: { color: colors.textMuted, lineHeight: 20 },
    actionsRow: { flexDirection: 'row', gap: spacing.sm },
    actionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionChipActiveExpense: { borderColor: colors.expense, backgroundColor: colors.expenseSoft },
    actionChipActiveIncome: { borderColor: colors.income, backgroundColor: colors.incomeSoft },
    expenseText: { color: colors.expense },
    suggestionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      marginTop: spacing.xs,
    },
    suggestionText: { flex: 1, color: colors.primary, lineHeight: 18 },
    categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
    allCategoriesScroll: { maxHeight: 200 },
    categoryChip: {
      // متن چیپ با numberOfLines و flexShrink داخل قاب گرد می‌ماند؛ دیگر گرید
      // دوستونه‌ی «۴۸٪» نداریم که اسم‌های بلند را ببرد و از قاب بیرون بزند.
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.pill,
      borderWidth: 1,
      backgroundColor: colors.surface,
    },
    categoryChipSuggested: { backgroundColor: colors.primarySoft },
    categoryDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryText: { flexShrink: 1, color: colors.text, textAlign: 'right' },
    suggestedBadge: {
      color: colors.primary,
      fontSize: 10,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
    },
    newCategoryChip: {
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    newCategoryChipActive: { backgroundColor: colors.surface },
    newCategoryText: { flexShrink: 1, color: colors.primary },
    createRow: { gap: spacing.sm, marginTop: spacing.xs },
    createInput: {
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
    iconChoices: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
    iconChoice: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    createButton: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      backgroundColor: colors.primary,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    primaryText: { color: colors.white },
    ignoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    quickModesCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    quickRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
    quickTexts: { flex: 1, gap: 2 },
    quickAction: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    quickActionDisabled: { opacity: 0.45 },
  });
