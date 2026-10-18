/**
 * Date and time formatting utilities for FundTogether
 */

export function parseDate(value?: string | number | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    // If Unix timestamp in seconds (less than 100 billion), convert to milliseconds
    const ms = value < 100_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Check if numeric timestamp string
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 100_000_000_000 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Formats a date string, timestamp, or Date object into Vietnamese `DD/MM/YYYY` format.
 * Uses UTC date values for ISO strings ending with 'Z' or date-only strings to prevent timezone day-shift.
 */
export function formatDate(
  value?: string | number | Date | null,
  fallback: string = 'Chưa xác định'
): string {
  if (!value) return fallback;

  // Fast path for ISO or YYYY-MM-DD strings to preserve intended calendar date
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}/${m}/${y}`;
    }
  }

  const date = parseDate(value);
  if (!date) return typeof value === 'string' ? value : fallback;

  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formats a date range into `start → end`.
 */
export function formatDateRange(
  start?: string | number | Date | null,
  end?: string | number | Date | null,
  fallback: string = 'Chưa xác định'
): string {
  if (!start && !end) return fallback;
  if (start && !end) return `Từ ${formatDate(start)}`;
  if (!start && end) return `Đến ${formatDate(end)}`;
  return `${formatDate(start)} → ${formatDate(end)}`;
}

/**
 * Formats a date with time `HH:mm DD/MM/YYYY`.
 */
export function formatDateTime(
  value?: string | number | Date | null,
  fallback: string = 'Chưa xác định'
): string {
  const date = parseDate(value);
  if (!date) return typeof value === 'string' ? value : fallback;

  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();

  return `${hours}:${mins} ${d}/${m}/${y}`;
}
