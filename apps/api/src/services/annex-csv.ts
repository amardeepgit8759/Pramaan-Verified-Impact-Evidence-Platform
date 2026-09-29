import { ANNEX_CSV_COLUMNS, annexCsvRow, type ReportDetail } from '@pramaan/shared';
import { stringify } from 'csv-stringify/sync';

/** Lets Excel detect UTF-8, so names with non-ASCII characters open correctly. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** The evidence annex as CSV: one row per cited file. */
export function annexCsv(report: ReportDetail): string {
  const rows = report.evidence.map((e) => annexCsvRow(e));
  return BYTE_ORDER_MARK + stringify(rows, { header: true, columns: [...ANNEX_CSV_COLUMNS] });
}
