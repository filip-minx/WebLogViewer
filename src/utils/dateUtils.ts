// Date utility functions

export function parseTimestamp(timestamp: string): Date | null {
  if (!timestamp) return null;

  try {
    // Try standard ISO format
    let date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;

    // Try Windows log format: YYYY-MM-DD_HH-MM-SS.mmm
    const windowsMatch = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.(\d{3})$/.exec(timestamp);
    if (windowsMatch) {
      const [, year, month, day, hour, minute, second, ms] = windowsMatch;
      date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
        parseInt(ms)
      );
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  } catch {
    return null;
  }
}

export function formatTimestamp(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;

  return date.toLocaleString();
}

export function isValidDateRange(start?: string, end?: string): boolean {
  if (!start && !end) return true;

  const startDate = start ? parseTimestamp(start) : null;
  const endDate = end ? parseTimestamp(end) : null;

  if (start && !startDate) return false;
  if (end && !endDate) return false;
  if (startDate && endDate && startDate > endDate) return false;

  return true;
}
