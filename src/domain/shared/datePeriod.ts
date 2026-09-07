const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_TOKEN_PATTERN = /^(\d{4})-(\d{2})$/;

export function getLocalDateToken(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getLocalMonthToken(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousDate(date: string): string {
  return shiftIsoDate(date, -1);
}

export function getNextDate(date: string): string {
  return shiftIsoDate(date, 1);
}

export function getPreviousMonth(month: string): string {
  return shiftMonthToken(month, -1);
}

export function getNextMonth(month: string): string {
  return shiftMonthToken(month, 1);
}

export function formatDateLabel(date: string): string {
  const parsed = parseIsoDate(date);

  if (!parsed) {
    return date;
  }

  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function formatMonthLabel(month: string): string {
  const parsed = parseMonthToken(month);

  if (!parsed) {
    return month;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function isMonthToken(value: string): boolean {
  return parseMonthToken(value) !== null;
}

function shiftIsoDate(value: string, days: number): string {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return value;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function shiftMonthToken(value: string, months: number): string {
  const parsed = parseMonthToken(value);

  if (!parsed) {
    return value;
  }

  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 7);
}

function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function parseMonthToken(value: string): Date | null {
  const match = MONTH_TOKEN_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}
