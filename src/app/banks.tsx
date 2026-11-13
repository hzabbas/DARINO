import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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

import { AppText } from '../components/AppText';
import { BankLogo } from '../components/BankLogo';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import {
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  totalBankBalance,
  updateBankAccount,
} from '../db/bankAccounts';
import { useDatabase } from '../db/DatabaseProvider';
import { countPendingSms } from '../db/pendingSms';
import { useDbQuery } from '../hooks/useDbQuery';
import {
  getRecentSmsSenders,
  hasSmsPermission,
  isSmsReaderAvailable,
  requestSmsPermission,
} from '../native/smsReader';
import { fonts, radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { BankAccount } from '../types/models';
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
  initial_balance: string;
  include_roundup: boolean;
  senders: string[];
}

const EMPTY_FORM: FormState = {
  bank_code: 'blu',
  title: '',
  account_number: '',
  initial_balance: '',
  include_roundup: false,
  senders: [],
};

export default function BanksScreen() {
  const database = useDatabase();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [isSheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorSender, setSimulatorSender] = useState('');
  const [simulatorBody, setSimulatorBody] = useState('');
  const [recentSenders, setRecentSenders] = useState<{ sender: string; lastBody: string; count: number }[]>([]);
  const [permission, setPermission] = useState<boolean | null>(null);

  const { data, reload } = useDbQuery((db) => ({
    accounts: listBankAccounts(db),
    total: totalBankBalance(db),
    pending: countPendingSms(db),
  }));

  const accounts = data?.accounts ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditing(account);
    setForm({
      bank_code: account.bank_code,
      title: account.title,
      account_number: account.account_number ?? '',
      initial_balance: String(account.initial_balance || ''),
      include_roundup: account.include_roundup,
      senders: account.senders,
    });
    setSheetOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) {
      notify('نام حساب لازم است', 'یک نام کوتاه برای این حساب بنویس، مثلاً «کارت اصلی».');
      return;
    }

    try {
      const payload = {
        bank_code: form.bank_code,
        title: form.title,
        account_number: form.account_number || null,
        senders: form.senders,
        initial_balance: parseAmount(form.initial_balance),
        include_roundup: form.include_roundup,
      };

      if (editing) {
        updateBankAccount(database, editing.id, payload);
      } else {
        createBankAccount(database, payload);
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
        <View style={styles.summaryIcon}>
          <Ionicons name="wallet-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.summaryTexts}>
          <AppText variant="caption" style={styles.muted}>
            موجودی کل حساب‌های فعال
          </AppText>
          <AppText variant="amountSmall">{`${formatAmount(data?.total ?? 0)} تومان`}</AppText>
        </View>
        <AppText variant="caption" style={styles.muted}>
          {`${toPersianDigits(accounts.length)} حساب`}
        </AppText>
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
                <AppText variant="caption" style={styles.muted}>
                  {getBank(account.bank_code).name}
                  {account.senders.length > 0 ? ` · ${account.senders.join('، ')}` : ' · بدون سرشماره'}
                </AppText>
              </View>
              <View style={styles.accountSide}>
                <AppText variant="amountSmall">{formatAmount(account.current_balance)}</AppText>
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
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <AppText variant="subtitle">{editing ? 'ویرایش حساب' : 'حساب بانکی جدید'}</AppText>
                <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <AppText variant="caption" style={styles.muted}>
                  بانک
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bankRow}>
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
                        <AppText variant="caption" style={styles.bankChipText} numberOfLines={1}>
                          {bank.name.replace('بانک ', '')}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <TextInput
                  value={form.title}
                  onChangeText={(title) => setForm((current) => ({ ...current, title }))}
                  placeholder="نام حساب، مثلاً کارت اصلی"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.primary}
                  style={styles.input}
                />

                <TextInput
                  value={form.initial_balance}
                  onChangeText={(text) =>
                    setForm((current) => ({ ...current, initial_balance: text.replace(/[^0-9۰-۹٠-٩]/g, '') }))
                  }
                  keyboardType="number-pad"
                  placeholder="موجودی قبلی (تومان)"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.primary}
                  style={styles.input}
                />

                <TextInput
                  value={form.account_number}
                  onChangeText={(text) => setForm((current) => ({ ...current, account_number: text }))}
                  placeholder="شماره کارت/حساب (اختیاری)"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.primary}
                  style={styles.input}
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
                      <AppText variant="caption">{sender}</AppText>
                      <Ionicons name="close" size={12} color={colors.textMuted} />
                    </Pressable>
                  ))}
                  {form.senders.length === 0 ? (
                    <AppText variant="caption" style={styles.muted}>
                      هنوز سرشماره‌ای اضافه نشده
                    </AppText>
                  ) : null}
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={senderModalOpen} animationType="slide" transparent onRequestClose={() => setSenderModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, styles.sheetTall]}>
            <View style={styles.sheetHeader}>
              <AppText variant="subtitle">سرشماره‌های پیامک</AppText>
              <Pressable onPress={() => setSenderModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {recentSenders.length === 0 ? (
                <AppText variant="caption" style={styles.muted}>
                  پیامکی پیدا نشد.
                </AppText>
              ) : (
                recentSenders.map((item) => (
                  <Pressable key={item.sender} onPress={() => addSender(item.sender)} style={styles.senderRow}>
                    <View style={styles.senderRowTexts}>
                      <AppText variant="label">{item.sender}</AppText>
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
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <AppText variant="subtitle">تست و شبیه‌ساز پیامک</AppText>
                <Pressable onPress={() => setSimulatorOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <TextInput
                  value={simulatorSender}
                  onChangeText={setSimulatorSender}
                  placeholder="فرستنده، مثلاً B.Pasargad"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.primary}
                  style={styles.input}
                />
                <TextInput
                  value={simulatorBody}
                  onChangeText={setSimulatorBody}
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
                  <Pressable onPress={() => runSimulation(true)} style={styles.saveButton}>
                    <AppText variant="caption" style={styles.saveText}>
                      افزودن به صف تایید
                    </AppText>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
    summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
    sheetWrap: { maxHeight: '92%' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.sm,
      maxHeight: '92%',
    },
    sheetTall: { maxHeight: '80%', minHeight: '50%' },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bankRow: { gap: spacing.sm, paddingVertical: spacing.xs },
    bankChip: {
      width: 74,
      alignItems: 'center',
      gap: 4,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    bankChipText: { color: colors.textMuted, textAlign: 'center' },
    input: {
      fontFamily: fonts.regular,
      fontWeight: 'normal',
      fontSize: 14,
      color: colors.text,
      textAlign: 'right',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    bodyInput: { minHeight: 110, textAlignVertical: 'top' },
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
    },
    saveText: { color: colors.white },
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
