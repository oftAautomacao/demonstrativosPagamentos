export type MoneyCents = number;

export const ZERO_CENTS: MoneyCents = 0;

const CENT_FACTOR = 100;

export function moneyFromDecimal(value: string | number): MoneyCents {
  if (typeof value === 'number') {
    return Math.round(value * CENT_FACTOR);
  }

  const trimmed = value.trim().replace(/[^\d,.-]/g, '');

  if (trimmed.length === 0) {
    return ZERO_CENTS;
  }

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);
  let normalized = trimmed;

  if (separatorIndex >= 0) {
    const trailing = trimmed.slice(separatorIndex + 1).replace(/[^\d]/g, '');
    const hasBothSeparators = lastComma >= 0 && lastDot >= 0;

    if (!hasBothSeparators && trailing.length > 2) {
      normalized = trimmed.replace(/[.,]/g, '');
    } else {
      const integerPart = trimmed
        .slice(0, separatorIndex)
        .replace(/[.,]/g, '')
        .replace('-', '');
      const decimalPart = trailing;
      const signal = trimmed.startsWith('-') ? '-' : '';
      normalized = `${signal}${integerPart}.${decimalPart}`;
    }
  } else {
    normalized = trimmed.replace(/[.,]/g, '');
  }

  if (normalized.length === 0) {
    return ZERO_CENTS;
  }

  return Math.round(Number(normalized) * CENT_FACTOR);
}

export function formatMoneyBRL(value: MoneyCents): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / CENT_FACTOR);
}

export function addMoney(...values: MoneyCents[]): MoneyCents {
  return values.reduce((sum, current) => sum + current, ZERO_CENTS);
}

export function subtractMoney(left: MoneyCents, right: MoneyCents): MoneyCents {
  return left - right;
}

export function areAmountsEqual(left: MoneyCents, right: MoneyCents): boolean {
  return left === right;
}
