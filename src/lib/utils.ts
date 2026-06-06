import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function slugToTitle(slug: string) {
  return slug
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
