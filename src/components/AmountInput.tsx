import { useState, useCallback, useRef } from 'react';
import type { Currency } from '@/db';
import { cn } from '@/lib/utils';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  currency?: Currency;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  min?: number;
}

const formatters: Record<Currency, Intl.NumberFormat> = {
  PYG: new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

function parseNumericInput(raw: string): number {
  const stripped = raw.replace(/[^\d.,-]/g, '');
  if (!stripped) return 0;
  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = stripped.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = stripped.replace(/,/g, '');
  } else {
    normalized = stripped.replace(/[,.]/g, '');
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function formatDisplay(value: number, currency: Currency): string {
  return value !== 0 ? formatters[currency].format(value) : '';
}

function toRawInput(value: number, currency: Currency): string {
  if (value === 0) return '';
  if (currency === 'PYG') return String(Math.round(value));
  return String(value);
}

export default function AmountInput({
  value,
  onChange,
  currency = 'PYG',
  placeholder = '0',
  className,
  autoFocus,
  disabled,
  id,
  name,
  required,
  min,
}: AmountInputProps) {
  const [rawInput, setRawInput] = useState(() =>
    value !== 0 ? toRawInput(value, currency) : '',
  );
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = isFocused
    ? rawInput
    : formatDisplay(value, currency);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const numeric = parseNumericInput(raw);
      setRawInput(raw);
      onChange(numeric);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setRawInput(toRawInput(value, currency));
  }, [value, currency]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const formatted = formatDisplay(value, currency);
    setRawInput(formatted);
  }, [value, currency]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      id={id}
      name={name}
      required={required}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50',
        className,
      )}
      min={min}
      autoComplete="off"
    />
  );
}
