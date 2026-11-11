import type { CategoryTotal, MonthlySummary } from '../types/models';
import { sharePercent } from './analytics';
import { formatAmount } from './currency';
import { toPersianDigits } from './digits';

export interface ReportTextInput {
  rangeLabel: string;
  summary: MonthlySummary;
  expenseBreakdown: CategoryTotal[];
  /** حداکثر تعداد دسته‌هایی که در متن می‌آید */
  limit?: number;
}

/**
 * متن آماده‌ی ارسال در تلگرام/واتساپ برای گزارش یک دوره.
 */
export function buildReportText({
  rangeLabel,
  summary,
  expenseBreakdown,
  limit = 6,
}: ReportTextInput): string {
  const lines: string[] = [];
  lines.push(`📊 گزارش دارینو — ${rangeLabel}`);
  lines.push('');
  lines.push(`💰 درآمد: ${formatAmount(summary.income)} تومان`);
  lines.push(`💸 هزینه: ${formatAmount(summary.expense)} تومان`);

  const balance = summary.balance;
  const sign = balance > 0 ? '📈 سود خالص' : balance < 0 ? '📉 کسری' : '⚖️ تراز';
  lines.push(`${sign}: ${formatAmount(Math.abs(balance))} تومان`);

  if (summary.income > 0) {
    const ratio = sharePercent(summary.expense, summary.income);
    lines.push(`🧮 سهم هزینه از درآمد: ${toPersianDigits(ratio)}٪`);
  }

  const top = expenseBreakdown.filter((item) => item.total > 0).slice(0, limit);
  if (top.length > 0) {
    lines.push('');
    lines.push('🔻 ریز هزینه‌ها:');
    for (const item of top) {
      const percent = sharePercent(item.total, summary.expense);
      lines.push(
        `• ${item.name}: ${formatAmount(item.total)} تومان (${toPersianDigits(percent)}٪ · ${toPersianDigits(item.count)} بار)`,
      );
    }
  }

  if (summary.expense === 0 && summary.income === 0) {
    lines.push('');
    lines.push('در این بازه تراکنشی ثبت نشده است.');
  }

  lines.push('');
  lines.push('ساخته‌شده با دارینو — کاملاً آفلاین');
  return lines.join('\n');
}
