import type { CellValue, Column, ColumnType } from "./model.ts";

// User data: a CSV parsed by code, never by a model. The models get the columns, their types and
// summary statistics (see `describeDataset`); the numbers of the chart are the uploaded values,
// through the transform the models agreed on, computed by the renderer.

/** The limits of an upload. Every row is copied into each version of the chart, so they stay small. */
export const CSV_LIMITS = { maxBytes: 64_000, maxRows: 500, maxColumns: 12, maxCellChars: 200 };

export interface Dataset {
  columns: Column[];
  rows: Record<string, CellValue>[];
}

export type CsvError =
  | "empty"
  | "too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "ragged"
  | "unterminated_quote"
  | "no_rows";

export class CsvParseError extends Error {
  override readonly name = "CsvParseError";
  constructor(
    readonly code: CsvError,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Parses a CSV (RFC 4180: quoted fields, doubled quotes, CRLF or LF; the separator is a comma, or a
 * semicolon when the header has more semicolons than commas). The first line names the columns:
 * names are trimmed, `.`, `[`, `]` and `\` (which Vega-Lite reads as paths) become `_`, and repeated
 * or empty names get a number. A column whose non-empty cells all read as numbers is "number"
 * (dot or comma decimals, see `parseNumber`), one whose cells all read as ISO dates is "date",
 * any other "text". Empty cells are null. Throws a `CsvParseError` beyond `CSV_LIMITS`.
 */
export function parseCsv(text: string, limits = CSV_LIMITS): Dataset {
  const body = text.replace(/^﻿/, "");
  if (utf8Length(body) > limits.maxBytes)
    throw new CsvParseError("too_large", `The CSV is larger than ${limits.maxBytes} bytes.`);
  if (body.trim() === "") throw new CsvParseError("empty", "The CSV is empty.");
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records = splitRecords(body, separator).filter((r) => r.some((c) => c.trim() !== ""));
  const [header, ...lines] = records;
  if (!header) throw new CsvParseError("empty", "The CSV is empty.");
  if (header.length > limits.maxColumns)
    throw new CsvParseError(
      "too_many_columns",
      `The CSV has more than ${limits.maxColumns} columns.`,
    );
  if (lines.length === 0) throw new CsvParseError("no_rows", "The CSV has a header and no rows.");
  if (lines.length > limits.maxRows)
    throw new CsvParseError("too_many_rows", `The CSV has more than ${limits.maxRows} rows.`);
  const names = columnNames(header);
  for (const [i, line] of lines.entries()) {
    if (line.length !== names.length)
      throw new CsvParseError(
        "ragged",
        `Row ${i + 2} of the CSV has ${line.length} fields, not ${names.length}.`,
      );
  }
  const cells = lines.map((line) => line.map((c) => c.trim().slice(0, limits.maxCellChars)));
  const columns: Column[] = names.map((name, i) => ({
    name,
    type: columnType(cells.map((line) => line[i] ?? "")),
  }));
  const rows = cells.map((line) => {
    const row: Record<string, CellValue> = {};
    columns.forEach((col, i) => {
      const raw = line[i] ?? "";
      row[col.name] = raw === "" ? null : col.type === "number" ? parseNumber(raw) : raw;
    });
    return row;
  });
  return { columns, rows };
}

function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

function splitRecords(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === separator) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else field += ch;
    i++;
  }
  if (quoted)
    throw new CsvParseError("unterminated_quote", "A quoted field of the CSV never ends.");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function columnNames(header: readonly string[]): string[] {
  const seen = new Set<string>();
  return header.map((raw, i) => {
    let name = raw.trim().replace(/[.[\]\\]/g, "_") || `col${i + 1}`;
    if (seen.has(name)) {
      let n = 2;
      while (seen.has(`${name}_${n}`)) n++;
      name = `${name}_${n}`;
    }
    seen.add(name);
    return name;
  });
}

const ISO_DATE = /^\d{4}(-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?)?)?$/;

function columnType(cells: readonly string[]): ColumnType {
  const filled = cells.filter((c) => c !== "");
  if (filled.length === 0) return "text";
  if (filled.every((c) => parseNumber(c) !== null)) {
    // a column of 4-digit years reads as numbers; it is a date only if some cell has a month
    return "number";
  }
  if (filled.every((c) => ISO_DATE.test(c))) return "date";
  return "text";
}

/**
 * Reads a number written by a person or a page: "2.7", "2,7", "1.234.567", "1,234,567",
 * "1 234 567", "-3,5 %", "US$ 12". A single separator followed by exactly 3 digits is a thousands
 * separator when the other separator does not appear ("1.234" is 1234, "1,5" is 1.5). Null when
 * the text is not one number.
 */
export function parseNumber(text: string): number | null {
  let t = text
    .trim()
    .replace(/[   ]/g, " ")
    .replace(/^(US\$|\$|€|£|ARS|USD)\s*/i, "")
    .replace(/\s*(%|‰)$/, "")
    .replace(/−/g, "-");
  if (!/^[-+]?\d[\d.,\s]*$/.test(t)) return null;
  t = t.replace(/\s(?=\d{3}\b)/g, "");
  if (/\s/.test(t)) return null;
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) {
    const decimal = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    if ((t.match(new RegExp(`\\${decimal}`, "g")) ?? []).length > 1) return null;
    t = t.split(thousands).join("").replace(decimal, ".");
  } else if (dots + commas > 1) {
    const sep = dots > 0 ? "." : ",";
    if (!new RegExp(`^[-+]?\\d{1,3}(\\${sep}\\d{3})+$`).test(t)) return null;
    t = t.split(sep).join("");
  } else if (dots + commas === 1) {
    const sep = dots > 0 ? "." : ",";
    const [whole, frac] = t.split(sep) as [string, string];
    if (frac.length === 3 && /^[-+]?\d{1,3}$/.test(whole) && sep === ".") {
      // "1.234": a thousands separator in Spanish, a decimal in English. A dot followed by exactly
      // three digits is read as thousands only when the whole part is not 0.
      t = whole.replace(/^[-+]?0$/, "") === "" ? `${whole}.${frac}` : `${whole}${frac}`;
    } else t = `${whole}.${frac}`;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface ColumnSummary {
  name: string;
  type: ColumnType;
  filled: number;
  empty: number;
  /** number: min, max, mean, sum; date: first and last; text: distinct count and the first values. */
  min: number | string | null;
  max: number | string | null;
  mean: number | null;
  sum: number | null;
  distinct: number;
  examples: string[];
}

/** What the models are told about an upload: the columns, their types and summary statistics. */
export function describeDataset(dataset: Dataset): ColumnSummary[] {
  return dataset.columns.map((col) => {
    const values = dataset.rows.map((r) => r[col.name] ?? null);
    const filled = values.filter((v): v is number | string => v !== null);
    const distinct = new Set(filled.map(String));
    const summary: ColumnSummary = {
      name: col.name,
      type: col.type,
      filled: filled.length,
      empty: values.length - filled.length,
      min: null,
      max: null,
      mean: null,
      sum: null,
      distinct: distinct.size,
      examples: [...distinct].slice(0, 5),
    };
    if (col.type === "number") {
      const nums = filled.filter((v): v is number => typeof v === "number");
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        summary.min = Math.min(...nums);
        summary.max = Math.max(...nums);
        summary.sum = round(sum);
        summary.mean = round(sum / nums.length);
      }
      summary.examples = [];
    } else if (col.type === "date") {
      const sorted = filled.map(String).sort();
      summary.min = sorted[0] ?? null;
      summary.max = sorted.at(-1) ?? null;
    }
    return summary;
  });
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
