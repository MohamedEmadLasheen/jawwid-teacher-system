import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string, lang: 'ar' | 'en' = 'en'): string {
  try {
    const date = new Date(dateStr);
    return format(date, 'dd MMM yyyy', { locale: lang === 'ar' ? ar : enUS });
  } catch {
    return dateStr;
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDateTime(dateStr: string, lang: 'ar' | 'en' = 'en'): string {
  try {
    const date = new Date(dateStr);
    return format(date, 'dd MMM yyyy HH:mm', { locale: lang === 'ar' ? ar : enUS });
  } catch {
    return dateStr;
  }
}