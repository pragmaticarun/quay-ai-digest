import type { DatePrecision } from "@/lib/types";

export type ParsedDate = {
  iso: string | null;
  precision: DatePrecision;
  raw: string | null;
};

export function parseSourceDate(value: string | null | undefined): ParsedDate {
  if (value == null) return { iso: null, precision: "unknown", raw: null };
  const trimmed = value.trim();
  if (!trimmed) return { iso: null, precision: "unknown", raw: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = `${trimmed}T00:00:00.000Z`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return { iso: null, precision: "unknown", raw: trimmed };
    return { iso: parsed.toISOString(), precision: "date", raw: trimmed };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { iso: null, precision: "unknown", raw: trimmed };
  return { iso: parsed.toISOString(), precision: "datetime", raw: trimmed };
}

export function formatUtc(iso: string | null, precision: DatePrecision): string {
  if (!iso || precision === "unknown") return "Date unknown";
  if (precision === "date") return `${iso.slice(0, 10)} (date only, stored as UTC midnight)`;
  return `${iso} (UTC)`;
}

export function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
