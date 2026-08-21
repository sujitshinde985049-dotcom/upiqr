export const CSV_EXPORT_MAX_ROWS = 10_000;

export function sanitizeCsvCell(value: string | number | null | undefined): string {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(stringValue)) {
    return `'${stringValue}`;
  }
  return stringValue;
}

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => escapeCsvField(sanitizeCsvCell(value)))
    .join(",");
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  return [buildCsvRow(headers), ...rows.map((row) => buildCsvRow(row))].join("\r\n");
}
