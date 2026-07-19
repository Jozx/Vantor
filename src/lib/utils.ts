import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Currency, AccountType } from '@/db';
import { Landmark, CircleDollarSign, TrendingUp, CreditCard } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Return today's date as a local YYYY-MM-DD string (not UTC). */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Convert any Date to a local YYYY-MM-DD string (not UTC). */
export function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatMoney(amount: number, curr: Currency | string): string {
  return curr === 'PYG'
    ? new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(amount)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * For "Other"-tagged transactions: if description is non-empty, show it;
 * otherwise show the tag name ("Other"). For all other tags, show tag name.
 */
export function displayTag(tagName: string | null, description?: string): string {
  if (!tagName) return '—';
  if (tagName === 'Other' && description && description.trim()) return description.trim();
  return tagName;
}

type LucideIcon = typeof Landmark;

export const accountTypeConfig: Record<
  AccountType,
  { label: string; icon: LucideIcon; colorClass: string }
> = {
  bank: { label: 'Bank Accounts', icon: Landmark, colorClass: 'text-blue-500 bg-blue-500/10' },
  broker: { label: 'Investments', icon: CircleDollarSign, colorClass: 'text-emerald-500 bg-emerald-500/10' },
  mutual_fund: { label: 'Mutual Funds', icon: TrendingUp, colorClass: 'text-purple-500 bg-purple-500/10' },
  credit_card: { label: 'Credit Cards', icon: CreditCard, colorClass: 'text-amber-500 bg-amber-500/10' },
};
