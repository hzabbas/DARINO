import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { BankLogo } from '../components/BankLogo';
import { Card } from '../components/Card';
import { MoneyInput } from '../components/MoneyInput';
import { Screen } from '../components/Screen';
import {
  SYNC_WINDOW_OPTIONS,
  createBankAccount,
  deleteBankAccount,
  getBankBalanceBreakdown,
  listBankAccounts,
  syncFromForWindow,
  syncWindowKeyFor,
  totalBankBalance,
  updateBankAccount,
  type SyncWindowOption,
} from '../db/bankAccounts';
import { getSetting, setSetting } from '../db/settings';
import {
  INCLUDE_BANK_BALANCE_IN_INCOME_KEY,
  syncOpeningBalanceIncome,
} from '../features/balanceIncome';
import { useDatabase } from '../db/DatabaseProvider';
import { countPendingSms } from '../db/pendingSms';
import { useDbQuery } from '../hooks/useDbQuery';
import { useFocusScroll } from '../hooks/useFocusScroll';
import { useSheetKeyboard } from '../hooks/useKeyboard';
import {
  getRecentSmsSenders,
  hasSmsPermission,
  isSmsReaderAvailable,
  requestSmsPermission,
} from '../native/smsReader';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { BankAccount } from '../types/models';
import { directionForInput, isolateLtr, joinLtrTokens } from '../utils/bidi';
import { formatAmount, parseAmount } from '../utils/currency';
import { toPersianDigits } from '../utils/digits';
import { confirmAction, notify } from '../utils/dialogs';
import { toPersianErrorMessage } from '../utils/errors';
import { ingestBankSms } from '../features/smsIngest';
import { IRANIAN_BANKS, getBank } from '../utils/iranianBanks';
import { parseBankSms } from '../utils/smsParser';

interface FormState {
  bank_code: string;
  title: string;
  account_number: string;
  /**
   * موجودی حساب به تومان (رقم لاتین، بدون جداکننده).
   * در حالت ساخت یعنی «موجودی اولیه» و در حالت ویرایش یعنی «موجودی فعلی»؛
   * چون مقدار فعلی حساب پیش‌پر می‌شود، ذخیره‌ی بدون تغییر هم موجودی را
   * دست‌نخورده نگه می‌دارد.
   */
  balance: string;
  include_roundup: boolean;
  senders: string[];
  /**
   * کلید بازه‌ی «از چه زمانی پیامک‌ها خوانده شوند» (یکی از SYNC_WINDOW_OPTIONS).
   * فقط همین انتخاب تعیین می‌کند که مهر `sync_from_ts` حساب بازمحاسبه شود یا نه.
   */
  sync_window: string;
}

const EMPTY_FORM: FormState = {
  bank_code: 'blu',
  title: '',
  account_number: '',
  balance: '',
  include_roundup: false,
  senders: [],
  // پیش‌فرض «فقط پیامک‌های جدید»: اتصال حساب نباید صف تایید را با پیامک‌های قدیمی پر کند
  sync_window: SYNC_WINDOW_OPTIONS[0].key,
};

/** گزینه‌ی پیش‌فرض انتخابگر بازه‌ی پیامک (فقط پیامک‌های جدید، از این لحظه به بعد). */
const DEFAULT_SYNC_WINDOW = SYNC_WINDOW_OPTIONS[0];

/** گزینه‌ی متناظر با یک کلید؛ کلید ناشناخته به پیش‌فرض برمی‌گردد. */
function syncWindowByKey(key: string): SyncWindowOption {
  return SYNC_WINDOW_OPTIONS.find((option) => option.key === key) ?? DEFAULT_SYNC_WINDOW;
}

export default function BanksScreen() {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  // هندسه‌ی شیت‌ها: ارتفاع کیبورد، فاصله‌ی امن و بیشترین ارتفاع مجاز
  const sheet = useSheetKeyboard(insets.top);
  const accountScroll = useFocusScroll();
  const simulatorScroll = useFocusScroll();

  const [isSheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /**
   * کلید بازه‌ای که هنگام باز شدن شیت انتخاب بوده است؛ با مقایسه‌ی آن با انتخاب فعلی
   * می‌فهمیم کاربر بازه‌ی همگام‌سازی را عوض کرده یا نه (فقط در حالت ویرایش مهم است).
   */
  const [initialSyncWindow, setInitialSyncWindow] = useState<string>(DEFAULT_SYNC_WINDOW.key);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorSender, setSimulatorSender] = useState('');
  const [simulatorBody, setSimulatorBody] = useState('');
  const [recentSenders, setRecentSenders] = useState<{ sender: string; lastBody: string; count: number }[]>([]);
  const [permission, setPermission] = useState<boolean | null>(null);

  const { data, reload } = useDbQuery((db) => ({
    accounts: listBankAccounts(db),
    total: totalBankBalance(db),
    bankBreakdown: getBankBalanceBreakdown(db, true),
    includeBankBalance: getSetting(db, INCLUDE_BANK_BALANCE_IN_INCOME_KEY) === '1',
    pending: countPendingSms(db),
  }));

  const accounts = data?.accounts ?? [];

  const handleSyncOpeningIncome = () => {
    const baseBalance = data?.bankBreakdown.totalBaseBankBalance ?? 0;
    const totalActive = data?.bankBreakdown.totalActiveBankBalance ?? (data?.total ?? 0);

    if (totalActive <= 0 && baseBalance <= 0) {
      notify('موجودی صفر', 'هیچ حساب فعالی با موجودی مثبت برای ثبت درآمد وجود ندارد.');
      return;
    }

    const targetAmount = baseBalance > 0 ? baseBalance : totalActive;

    confirmAction({
      title: 'ثبت موجودی کارت‌ها به‌عنوان درآمد',
      message: `موجودی پایه‌ی کارت‌های فعال (${formatAmount(targetAmount)} تومان) در دسته‌بندی «موجودی کارت‌ها و دارایی اولیه» ثبت می‌شود و لنگر حساب‌ها به‌روزرسانی می‌شود تا از ثبت مجدد یا تکراری جلوگیری شود. ادامه می‌دهی؟`,
      confirmLabel: 'ثبت درآمد',
      onConfirm: () => {
        try {
          const result = syncOpeningBalanceIncome(database);
          if (result.skipped) {
            notify('ثبت انجام نشد', result.reason ?? 'موجودی پایه‌ای برای ثبت یافت نشد.');
            return;
          }
          notify(
            result.inserted ? 'درآمد افتتاحیه ثبت شد' : 'درآمد افتتاحیه به‌روز شد',
            `مبلغ ${formatAmount(result.amount)} تومان به‌عنوان درآمد ثبت شد و لنگر ${toPersianDigits(result.reanchoredAccounts)} حساب به این لحظه منتقل شد.`,
          );
          reload();
        } catch (error) {
          notify('خطا در ثبت درآمد', toPersianErrorMessage(error));
        }
      },
    });
  };

  const handleToggleIncludeBankBalance = () => {
    const next = !(data?.includeBankBalance ?? false);
    setSetting(database, INCLUDE_BANK_BALANCE_IN_INCOME_KEY, next ? '1' : '0');
    reload();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setInitialSyncWindow(DEFAULT_SYNC_WINDOW.key);
    setSheetOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    // انتخابگر بازه از مهر فعلی حساب پر می‌شود تا کاربر وضعیت واقعی را ببیند
    const windowKey = syncWindowKeyFor(account.sync_from_ts);
    setEditing(account);
    setInitialSyncWindow(windowKey);
    setForm({
      bank_code: account.bank_code,
      title: account.title,
      account_number: account.account_number ?? '',
      // موجودی فعلی حساب پیش‌پر می‌شود تا کاربر بداند چه عددی ذخیره شده است
      balance: String(account.current_balance ?? 0),
      include_roundup: account.include_roundup,
      senders: account.senders,
      sync_window: windowKey,
    });
    setSheetOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) {
      notify('نام حساب لازم است', 'یک نام کوتاه برای این حساب بنویس، مثلاً «کارت اصلی».');
      return;
    }

    try {
      const shared = {
        bank_code: form.bank_code,
        title: form.title,
        account_number: form.account_number || null,
        senders: form.senders,
        include_roundup: form.include_roundup,
      };
      const balance = parseAmount(form.balance);
      const window = syncWindowByKey(form.sync_window);

      if (editing) {
        // فقط موجودی روز حساب تغییر می‌کند؛ موجودی اولیه (تاریخچه) دست‌نخورده می‌ماند
        const changes: Parameters<typeof updateBankAccount>[2] = {
          ...shared,
          current_balance: balance,
        };
        // مهر همگام‌سازی فقط وقتی بازنویسی می‌شود که کاربر خودش بازه را عوض کرده باشد.
        // ارسال بی‌دلیلِ `sync_from_ts` تازه، پیامک‌های در راه (که هنوز به صف نرسیده‌اند)
        // را برای همیشه دور می‌ریزد.
        if (form.sync_window !== initialSyncWindow) {
          changes.sync_from_ts = syncFromForWindow(window.hours);
        }
        updateBankAccount(database, editing.id, changes);
      } else {
        createBankAccount(database, {
          ...shared,
          initial_balance: balance,
          // «فقط پیامک‌های جدید» یعنی مرز دقیقاً همین لحظه‌ی ساخت حساب
          sync_from_ts: syncFromForWindow(window.hours),
        });
      }
      setSheetOpen(false);
      reload();
    } catch (error) {
      notify('ذخیره نشد', toPersianErrorMessage(error));
    }
  };

  const remove = (account: BankAccount) => {
    confirmAction({
      title: 'حذف حساب',
      message: `حساب «${account.title}» حذف شود؟ تراکنش‌های ثبت‌شده دست‌نخورده می‌مانند.`,
      confirmLabel: 'حذف',
      destructive: true,
      onConfirm: () => {
        deleteBankAccount(database, account.id);
        reload();
      },
    });
  };

  const openSenderPicker = async () => {
    if (!isSmsReaderAvailable) {
      notify('فقط در نسخه اندروید', 'در نسخه وب یا Expo Go دسترسی به پیامک‌های گوشی ممکن نیست.');
      return;
    }
    const granted = (await hasSmsPermission()) || (await requestSmsPermission());
    setPermission(granted);
    if (!granted) {
      notify('دسترسی داده نشد', 'برای خواندن پیامک‌های بانکی، اجازه‌ی خواندن پیامک لازم است.');
      return;
    }
    const senders = await getRecentSmsSenders();
    setRecentSenders(senders);
    setSenderModalOpen(true);
  };

  const addSender = (sender: string) => {
    setForm((current) =>
      current.senders.includes(sender)
        ? current
        : { ...current, senders: [...current.senders, sender] },
    );
    setSenderModalOpen(false);
  };

  const runSimulation = (persist: boolean) => {
    if (!simulatorSender.trim() || !simulatorBody.trim()) {
      notify('ورودی ناقص', 'فرستنده و متن پیامک را پر کن.');
      return;
    }

    const parsed = parseBankSms({ sender: simulatorSender, body: simulatorBody });

    if (!persist) {
      const lines = [
        `نوع: ${parsed.kind === 'transaction' ? (parsed.type === 'income' ? 'درآمد' : 'هزینه') : parsed.kind === 'otp' ? 'رمز پویا (نادیده)' : 'نامشخص'}`,
        `مبلغ: ${formatAmount(parsed.amount)} تومان`,
        parsed.balance !== null ? `مانده: ${formatAmount(parsed.balance)} تومان` : null,
        parsed.shamsi ? `تاریخ: ${parsed.shamsi} ${parsed.time ?? ''}` : null,
        parsed.roundup ? `رند: ${formatAmount(parsed.roundup)} تومان` : null,
      ].filter(Boolean);
      notify('نتیجه تحلیل (بدون ثبت)', lines.join('\n'));
      return;
    }

    const result = ingestBankSms(database, {
      sender: simulatorSender,
      body: simulatorBody,
    });

    const messages: Record<string, string> = {
      queued: 'در صف تایید ثبت شد.',
      duplicate: 'این پیامک قبلاً ثبت شده بود.',
      'ignored-otp': 'رمز پویا تشخیص داده شد و ثبت نشد.',
      'ignored-unknown': 'متن پیامک تراکنشی نبود.',
      'unmatched-account': 'هیچ حسابی با این سرشماره پیدا نشد؛ اول حساب را با همین سرشماره بساز.',
    };

    notify('نتیجه', messages[result.status] ?? result.status);
    if (result.status === 'queued') {
      setSimulatorBody('');
      setSimulatorOpen(false);
    }
    reload();
  };

  const banksList = useMemo(() => IRANIAN_BANKS.filter((bank) => bank.code !== 'other'), []);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <AppText variant="title">حساب‌ها و پیامک‌خوان</AppText>
          <AppText variant="caption" style={styles.headerSubtitle}>
            موجودی حساب‌ها را نگه دار و تراکنش‌ها را خودکار از پیامک بگیر
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="بستن"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.closeButton}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryIcon}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.summaryTexts}>
            <AppText variant="caption" style={styles.muted}>
              موجودی کل حساب‌های فعال
            </AppText>
            <AppText
              variant="amountSmall"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}>
              {`${formatAmount(data?.total ?? 0)} تومان`}
            </AppText>
          </View>
          <AppText variant="caption" style={styles.muted}>
            {`${toPersianDigits(accounts.length)} حساب`}
          </AppText>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="افزودن موجودی کارت‌ها به درآمد"
            onPress={handleSyncOpeningIncome}
            style={({ pressed }) => [styles.syncIncomeButton, pressed && styles.pressed]}>
            <Ionicons name="add-circle" size={16} color={colors.white} />
            <AppText variant="caption" style={styles.syncIncomeButtonText} numberOfLines={1}>
              افزودن موجودی کارت‌ها به درآمد
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: data?.includeBankBalance ?? false }}
            accessibilityLabel="احتساب موجودی کارت‌ها در درآمد داشبورد"
            onPress={handleToggleIncludeBankBalance}
            style={styles.includeToggle}>
            <Switch
              pointerEvents="none"
              value={data?.includeBankBalance ?? false}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
            <AppText variant="caption" style={styles.includeToggleText} numberOfLines={1}>
              احتساب در درآمد داشبورد
            </AppText>
          </Pressable>
        </View>
      </Card>

      {transportRow()}

      <View style={styles.listHeader}>
        <AppText variant="subtitle">حساب‌های من</AppText>
        <Pressable onPress={openCreate} style={styles.addChip} accessibilityRole="button">
          <Ionicons name="add" size={15} color={colors.primary} />
          <AppText variant="caption" style={styles.addChipText}>
            حساب جدید
          </AppText>
        </Pressable>
      </View>

      {accounts.length === 0 ? (
        <Card>
          <AppText variant="label">هنوز حسابی اضافه نکرده‌ای</AppText>
          <AppText variant="caption" style={styles.muted}>
            با افزودن حساب و اتصال سرشماره‌ی پیامک بانک، تراکنش‌ها خودکار شناسایی می‌شوند.
          </AppText>
        </Card>
      ) : (
        <View style={styles.accountList}>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              onPress={() => openEdit(account)}
              style={styles.accountRow}>
              <BankLogo code={account.bank_code} size={44} />
              <View style={styles.accountTexts}>
                <AppText variant="label">{account.title}</AppText>
                <AppText variant="caption" style={styles.muted} numberOfLines={2}>
                  {getBank(account.bank_code).name}
                  {account.senders.length > 0
                    ? ` · ${joinLtrTokens(account.senders)}`
                    : ' · بدون سرشماره'}
                </AppText>
              </View>
              <View style={styles.accountSide}>
                <AppText
                  variant="amountSmall"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}>
                  {formatAmount(account.current_balance)}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="حذف حساب"
                  hitSlop={6}
                  onPress={() => remove(account)}>
                  <Ionicons name="trash-outline" size={14} color={colors.expense} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {data?.pending ? (
        <Card style={styles.pendingCard}>
          <Ionicons name="mail-unread-outline" size={18} color={colors.warning} />
          <AppText variant="caption" style={styles.pendingText}>
            {`${toPersianDigits(data.pending)} تراکنش در صف تایید است.`}
          </AppText>
        </Card>
      ) : null}

      <AppText variant="caption" style={styles.note}>
        پیامک‌ها فقط روی همین گوشی خوانده و تحلیل می‌شوند؛ هیچ داده‌ای به اینترنت فرستاده نمی‌شود.
      </AppText>

      <Modal visible={isSheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <View style={[styles.modalBackdrop, { paddingBottom: sheet.lift }]} onLayout={sheet.onLayout}>
          <View
            style={[
              styles.sheet,
              { maxHeight: sheet.maxHeight },
              sheet.lift > 0 ? styles.sheetRaised : null,
            ]}>
            <View style={styles.sheetHeader}>
              <AppText variant="subtitle">{editing ? 'ویرایش حساب' : 'حساب بانکی جدید'}</AppText>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              ref={accountScroll.scrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <AppText variant="caption" style={styles.muted}>
                بانک
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bankRowScroll}
                contentContainerStyle={styles.bankRow}
                keyboardShouldPersistTaps="handled">
                {banksList.map((bank) => {
                  const selected = form.bank_code === bank.code;
                  return (
                    <Pressable
                      key={bank.code}
                      onPress={() =>
                        setForm((current) => ({
                          ...current,
                          bank_code: bank.code,
                          include_roundup: bank.code === 'blu',
                        }))
                      }
                      style={[styles.bankChip, selected && { borderColor: bank.color }]}>
                      <BankLogo code={bank.code} size={34} />
                      <AppText variant="caption" style={styles.bankChipText} numberOfLines={2}>
                        {bank.name.replace('بانک ', '')}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <TextInput
                value={form.title}
                onChangeText={(title) => setForm((current) => ({ ...current, title }))}
                onFocus={accountScroll.onFocus}
                placeholder="نام حساب، مثلاً کارت اصلی"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                style={[styles.input, { writingDirection: directionForInput(form.title, 'نام حساب') }]}
              />

              <MoneyInput
                label={editing ? 'موجودی فعلی حساب (تومان)' : 'موجودی اولیه حساب (تومان)'}
                value={form.balance}
                onChangeValue={(digits) => setForm((current) => ({ ...current, balance: digits }))}
                onFocus={accountScroll.onFocus}
                emptyHint={
                  editing
                    ? 'دست‌نزدن به این عدد، موجودی فعلی حساب را بدون تغییر نگه می‌دارد.'
                    : undefined
                }
                accessibilityLabel={editing ? 'موجودی فعلی حساب به تومان' : 'موجودی اولیه حساب به تومان'}
              />

              <TextInput
                value={form.account_number}
                onChangeText={(text) => setForm((current) => ({ ...current, account_number: text }))}
                onFocus={accountScroll.onFocus}
                placeholder="شماره کارت/حساب (اختیاری)"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                style={[
                  styles.input,
                  styles.numberInput,
                  {
                    writingDirection: directionForInput(
                      form.account_number,
                      'شماره کارت/حساب (اختیاری)',
                    ),
                  },
                ]}
              />

              <View style={styles.senderHeader}>
                <AppText variant="caption" style={styles.muted}>
                  سرشماره‌های پیامک
                </AppText>
                <Pressable onPress={openSenderPicker} style={styles.pickChip} accessibilityRole="button">
                  <Ionicons name="mail-outline" size={13} color={colors.primary} />
                  <AppText variant="caption" style={styles.pickChipText}>
                    انتخاب از پیامک‌های گوشی
                  </AppText>
                </Pressable>
              </View>

              <View style={styles.senderChips}>
                {form.senders.map((sender) => (
                  <Pressable
                    key={sender}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        senders: current.senders.filter((item) => item !== sender),
                      }))
                    }
                    style={styles.senderChip}>
                    <AppText variant="caption">{isolateLtr(sender)}</AppText>
                    <Ionicons name="close" size={12} color={colors.textMuted} />
                  </Pressable>
                ))}
                {form.senders.length === 0 ? (
                  <AppText variant="caption" style={styles.muted}>
                    هنوز سرشماره‌ای اضافه نشده
                  </AppText>
                ) : null}
              </View>

              <View style={styles.syncSection}>
                <AppText variant="caption" style={styles.muted}>
                  از چه زمانی پیامک‌های این حساب خوانده شوند؟
                </AppText>
                <View style={styles.syncOptions}>
                  {SYNC_WINDOW_OPTIONS.map((option) => {
                    const selected = form.sync_window === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() =>
                          setForm((current) => ({ ...current, sync_window: option.key }))
                        }
                        style={[styles.syncOption, selected && styles.syncOptionActive]}>
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={selected ? colors.primary : colors.textFaint}
                        />
                        <AppText
                          variant="caption"
                          style={[styles.syncOptionText, selected && styles.syncOptionTextActive]}>
                          {option.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <AppText variant="caption" style={styles.syncHint}>
                  پیامک‌های قدیمی‌تر از بازه‌ی انتخابی خوانده نمی‌شوند؛ پس وصل‌کردن حساب، صف
                  تایید را با پیامک‌های قدیمی چند ماه گذشته‌ی بانک پر نمی‌کند.
                </AppText>
              </View>

              {form.bank_code === 'blu' ? (
                <Pressable
                  onPress={() => setForm((current) => ({ ...current, include_roundup: !current.include_roundup }))}
                  style={styles.switchRow}>
                  <AppText variant="caption">مبلغ رندشده هم ثبت شود</AppText>
                  <Ionicons
                    name={form.include_roundup ? 'toggle' : 'toggle-outline'}
                    size={26}
                    color={form.include_roundup ? colors.primary : colors.textFaint}
                  />
                </Pressable>
              ) : null}
            </ScrollView>

            <Pressable onPress={save} style={styles.saveButton}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
              <AppText variant="caption" style={styles.saveText}>
                {editing ? 'ذخیره تغییرات' : 'افزودن حساب'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={senderModalOpen} animationType="slide" transparent onRequestClose={() => setSenderModalOpen(false)}>
        <View style={[styles.modalBackdrop, { paddingBottom: sheet.lift }]} onLayout={sheet.onLayout}>
          <View style={[styles.sheet, styles.sheetTall, { maxHeight: sheet.maxHeight }]}>
            <View style={styles.sheetHeader}>
              <AppText variant="subtitle">سرشماره‌های پیامک</AppText>
              <Pressable onPress={() => setSenderModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {recentSenders.length === 0 ? (
                <AppText variant="caption" style={styles.muted}>
                  پیامکی پیدا نشد.
                </AppText>
              ) : (
                recentSenders.map((item) => (
                  <Pressable key={item.sender} onPress={() => addSender(item.sender)} style={styles.senderRow}>
                    <View style={styles.senderRowTexts}>
                      <AppText variant="label">{isolateLtr(item.sender)}</AppText>
                      <AppText variant="caption" style={styles.muted} numberOfLines={1}>
                        {item.lastBody}
                      </AppText>
                    </View>
                    <AppText variant="caption" style={styles.muted}>
                      {toPersianDigits(item.count)}
                    </AppText>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={simulatorOpen} animationType="slide" transparent onRequestClose={() => setSimulatorOpen(false)}>
        <View style={[styles.modalBackdrop, { paddingBottom: sheet.lift }]} onLayout={sheet.onLayout}>
          <View style={[styles.sheet, { maxHeight: sheet.maxHeight }]}>
            <View style={styles.sheetHeader}>
              <AppText variant="subtitle">تست و شبیه‌ساز پیامک</AppText>
              <Pressable onPress={() => setSimulatorOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              ref={simulatorScroll.scrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <TextInput
                value={simulatorSender}
                onChangeText={setSimulatorSender}
                onFocus={simulatorScroll.onFocus}
                placeholder="فرستنده، مثلاً B.Pasargad"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                style={[
                  styles.input,
                  styles.numberInput,
                  {
                    writingDirection: directionForInput(
                      simulatorSender,
                      'فرستنده، مثلاً B.Pasargad',
                    ),
                  },
                ]}
              />
              <TextInput
                value={simulatorBody}
                onChangeText={setSimulatorBody}
                onFocus={simulatorScroll.onFocus}
                placeholder="متن کامل پیامک را اینجا بچسبان"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                multiline
                style={[styles.input, styles.bodyInput]}
              />

              <View style={styles.sampleRow}>
                {SAMPLE_SMS.map((sample) => (
                  <Pressable
                    key={sample.label}
                    onPress={() => {
                      setSimulatorSender(sample.sender);
                      setSimulatorBody(sample.body);
                    }}
                    style={styles.sampleChip}>
                    <AppText variant="caption">{sample.label}</AppText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.simulatorActions}>
                <Pressable onPress={() => runSimulation(false)} style={styles.secondaryButton}>
                  <AppText variant="caption" style={styles.secondaryText}>
                    تحلیل بدون ثبت
                  </AppText>
                </Pressable>
                <Pressable onPress={() => runSimulation(true)} style={[styles.saveButton, styles.inlineAction]}>
                  <AppText variant="caption" style={styles.saveText}>
                    افزودن به صف تایید
                  </AppText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );

  function transportRow() {
    return (
      <Card style={styles.transportCard}>
        <View style={styles.summaryTexts}>
          <AppText variant="label">پیامک‌خوان خودکار</AppText>
          <AppText variant="caption" style={styles.muted}>
            {isSmsReaderAvailable
              ? permission === false
                ? 'دسترسی خواندن پیامک داده نشده است'
                : 'فقط سرشماره‌های همین حساب‌ها خوانده می‌شوند؛ بدون مصرف باتری'
              : 'در این نسخه (وب / Expo Go) در دسترس نیست'}
          </AppText>
        </View>
        <Pressable
          onPress={async () => {
            const granted = await requestSmsPermission();
            setPermission(granted);
            notify(
              granted ? 'دسترسی داده شد' : 'دسترسی داده نشد',
              granted ? 'از این پس پیامک‌های بانکی خودکار خوانده می‌شوند.' : 'برای این قابلیت به مجوز خواندن پیامک نیاز است.',
            );
          }}
          style={styles.pickChip}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
          <AppText variant="caption" style={styles.pickChipText}>
            اجازه‌نامه
          </AppText>
        </Pressable>
        <Pressable onPress={() => setSimulatorOpen(true)} style={styles.pickChip}>
          <Ionicons name="flask-outline" size={14} color={colors.primary} />
          <AppText variant="caption" style={styles.pickChipText}>
            تست
          </AppText>
        </Pressable>
      </Card>
    );
  }
}

const SAMPLE_SMS = [
  {
    label: 'بلو (برداشت)',
    sender: '09999987641',
    body: 'بلو\nبرداشت زند\nعباس عزیز، 1,611,500 ریال از حساب شما پرید.\nو 88,500 ریال هم رند شد.\nموجودی: 3,529,970 ریال',
  },
  {
    label: 'پاسارگاد (-)',
    sender: 'B.Pasargad',
    body: '777.888.27923610.1\n-4,811,000\n08/20 21:53\nمانده: 116,556',
  },
  {
    label: 'مهر (+)',
    sender: 'B.QMEHRIRAN',
    body: '300379091710\n4,800,000+\n1405/8/20-21:53\nمانده:100,812,087',
  },
];

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headerTexts: { flexShrink: 1 },
    headerSubtitle: { marginTop: 2, color: colors.textMuted },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    summary: { gap: spacing.md },
    summaryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    summaryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    summaryActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    syncIncomeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 3,
      borderRadius: radius.pill,
    },
    syncIncomeButtonText: { color: colors.white, fontWeight: '700' },
    includeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    includeToggleText: { color: colors.text, fontSize: 12 },
    pressed: { opacity: 0.7 },
    summaryIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryTexts: { flex: 1, gap: 2 },
    muted: { color: colors.textMuted },
    transportCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    addChipText: { color: colors.primary },
    accountList: { gap: spacing.sm },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
    },
    accountTexts: { flex: 1, gap: 2 },
    accountSide: { alignItems: 'flex-end', gap: spacing.xs },
    pendingCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pendingText: { flex: 1, color: colors.warning },
    note: { color: colors.textFaint },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: spacing.lg,
      maxHeight: '92%',
    },
    sheetRaised: {
      borderBottomLeftRadius: radius.sm,
      borderBottomRightRadius: radius.sm,
    },
    sheetTall: { minHeight: '45%' },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sheetScroll: { flexShrink: 1 },
    sheetContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    bankRowScroll: { marginHorizontal: -spacing.lg, flexGrow: 0 },
    bankRow: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    bankChip: {
      width: 86,
      minHeight: 76,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 4,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    bankChipText: { color: colors.textMuted, textAlign: 'center', lineHeight: 15 },
    input: {
      fontFamily: fonts.regular,
      fontWeight: 'normal',
      fontSize: 14,
      lineHeight: 22,
      color: colors.text,
      textAlign: 'right',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
    },
    numberInput: { textAlign: 'right', writingDirection: 'ltr' },
    bodyInput: { minHeight: 110, textAlignVertical: 'top', writingDirection: 'rtl', textAlign: 'right' },
    senderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
    pickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    pickChipText: { color: colors.primary },
    senderChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
    syncSection: { gap: spacing.xs, marginTop: spacing.sm },
    syncOptions: { gap: spacing.xs },
    syncOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    syncOptionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    syncOptionText: { flex: 1, color: colors.textMuted },
    syncOptionTextActive: { color: colors.primary },
    syncHint: { color: colors.textFaint, lineHeight: 18 },
    senderChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.md,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    saveText: { color: colors.white },
    /** دکمه‌ی اصلی داخل محتوای اسکرول‌شو؛ حاشیه‌ی افقی محتوا را دوباره اضافه نمی‌کند */
    inlineAction: { flex: 1, marginHorizontal: 0, marginBottom: 0, marginTop: 0 },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      backgroundColor: colors.surfaceMuted,
    },
    secondaryText: { color: colors.textMuted },
    simulatorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    sampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
    sampleChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    senderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    senderRowTexts: { flex: 1, gap: 1 },
  });
