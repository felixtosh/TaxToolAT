import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number,
  currency: string = "EUR",
  locale: string = "de-DE"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export function formatDate(date: Date, locale: string = "de-DE"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/**
 * Get the color class for an amount (red for negative, green for positive)
 */
export function getAmountColorClass(amount: number): string {
  return amount < 0 ? "text-red-600" : "text-green-600";
}

/**
 * Format a date with optional time display (if not midnight)
 */
export function formatDateWithTime(
  date: Date,
  options: { dateFormat?: string; timeFormat?: string } = {}
): { date: string; time?: string } {
  const { dateFormat = "MMM d, yyyy", timeFormat = "HH:mm" } = options;
  // Use date-fns format function if available, otherwise use Intl
  const dateStr = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hasTime = hours !== 0 || minutes !== 0;

  const timeStr = hasTime
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    : undefined;

  return { date: dateStr, time: timeStr };
}
