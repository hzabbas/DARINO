import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { getMonthlySummary, listRecentTransactions } from '../../db/transactions';
import { useDbQuery } from '../../hooks/useDbQuery';
import { colors, radius, spacing } from '../../theme';
import { formatAmount } from '../../utils/currency';
import { formatTodayLabel, getJalaliMonthRange } from '../../utils/jalali';
import type { MonthlySummary } from '../../types/models';

const EMPTY_SUMMARY: MonthlySummary = { income: 0, expense: 0, balance: 0 };

export default function DashboardScreen() {
  const { data } = useDbQuery((db) => {
    const range = getJalaliMonthRange();
    return {
      range,
      summary: getMonthlySummary(db, range.startIso, range.endIso),
      recent: listRecentTransactions(db, 6),
    };
  });

  const range = data?.range ?? getJalaliMonthRange();
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const recent = data?.recent ?? [];

  return (
    <Screen>
      <ScreenHeader title="داشبورد" subtitle={formatTodayLabel()} />

      <View style={styles.hero}>
        <View style={styles.glow} />
        <AppText variant="caption" style={styles.heroCaption}>
          موجودی {range.label}
        </AppText>
        <View style={styles.heroAmountRow}>
          <AppText variant="display" style={styles.heroAmount}>
            {formatAmount(summary.balance)}
          </AppText>
          <AppText variant="caption" style={styles.heroCurrency}>
            تومان
          </AppText>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStats}>
          <View style={styles.stat}>
            <View style={styles.statLabelRow}>
              <Ionicons name="arrow-down-circle" size={14} color="rgba(255,255,255,0.75)" />
              <AppText variant="caption" style={styles.statLabel}>
                درآمد
              </AppText>
            </View>
            <AppText variant="amountSmall" style={styles.statValue}>
              {formatAmount(summary.income)}
            </AppText>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.stat}>
            <View style={styles.statLabelRow}>
              <Ionicons name="arrow-up-circle" size={14} color="rgba(255,255,255,0.75)" />
              <AppText variant="caption" style={styles.statLabel}>
                هزینه
              </AppText>
            </View>
            <AppText variant="amountSmall" style={styles.statValue}>
              {formatAmount(summary.expense)}
            </AppText>
          </View>
        </View>
      </View>

      <SectionHeader title="تراکنش‌های اخیر" />

      {recent.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="هنوز تراکنشی ثبت نشده"
          message="اولین درآمد یا هزینه‌ات را ثبت کن تا خلاصه‌ی این ماه ساخته شود."
          actionLabel="ثبت اولین تراکنش"
          onActionPress={() => router.navigate('/add')}
        />
      ) : (
        <Card style={styles.listCard}>
          {recent.map((transaction, index) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              last={index === recent.length - 1}
            />
          ))}
        </Card>
      )}

      <View style={styles.footNote}>
        <Ionicons name="lock-closed-outline" size={13} color={colors.textFaint} />
        <AppText variant="caption" style={styles.footNoteText}>
          همه‌ی اطلاعات فقط روی همین گوشی ذخیره می‌شود.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    top: -90,
    left: -50,
  },
  heroCaption: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroAmount: {
    color: colors.white,
    fontSize: 29,
    lineHeight: 42,
  },
  heroCurrency: {
    color: 'rgba(255, 255, 255, 0.72)',
    marginBottom: 6,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginVertical: spacing.lg,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  statValue: {
    color: colors.white,
  },
  verticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginHorizontal: spacing.lg,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  footNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  footNoteText: {
    color: colors.textFaint,
  },
});
