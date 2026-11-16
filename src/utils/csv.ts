import type { TransactionWithCategory } from '../types/models';
import { formatShamsiShort } from './jalali';

const HEADERS = ['تاریخ شمسی', 'تاریخ میلادی', 'نوع', 'دسته‌بندی', 'مبلغ (تومان)', 'توضیحات'];

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build CSV string with UTF-8 BOM and CRLF line endings for Excel compatibility.
 */
export function buildTransactionsCsv(rows: TransactionWithCategory[]): string {
  const lines = [HEADERS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        formatShamsiShort(row.date),
        row.date.slice(0, 10),
        row.type === 'income' ? 'درآمد' : 'هزینه',
        row.category_name ?? 'بدون دسته‌بندی',
        String(row.amount),
        row.note ?? '',
      ]
        .map(escapeCell)
        .join(','),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildCsvFileName(now: Date = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('-');
  return `darino-transactions-${stamp}.csv`;
}
