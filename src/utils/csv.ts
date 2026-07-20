// Minimal, dependency-free CSV export. Quotes fields containing commas, quotes,
// or newlines per RFC 4180 so exported analytics open cleanly in any spreadsheet.
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: (keyof T)[],
): string {
  if (rows.length === 0) return "";
  const cols = (columns ?? (Object.keys(rows[0]) as (keyof T)[]));
  const esc = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => esc(String(c))).join(",");
  const body = rows.map((row) => cols.map((c) => esc(row[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
