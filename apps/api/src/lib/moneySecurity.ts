import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

/** Constant-time hex/string compare for webhook HMAC signatures. */
export function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Mask SA account numbers for API responses and logs — never echo full digits. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = String(accountNumber).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function last4Account(accountNumber: string): string {
  const digits = String(accountNumber).replace(/\D/g, '');
  return digits.slice(-4) || '****';
}

/** Redact bank fields before audit / logs. */
export function redactBankForAudit(bank: {
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  branchCode?: string;
}): Record<string, string> {
  return {
    accountName: bank.accountName ? '[redacted]' : '',
    bankName: bank.bankName ?? '',
    accountNumberLast4: bank.accountNumber ? last4Account(bank.accountNumber) : '',
    branchCode: bank.branchCode ? '[redacted]' : '',
  };
}

/**
 * Triple-check order total, stored payment, and provider-verified amount.
 * Prevents under/over-charge fulfilment.
 */
export function assertMoneyAmountsMatch(input: {
  orderTotalCents: number;
  paymentAmountCents: number;
  verifiedAmountCents: number;
  currency: string;
}): void {
  const { orderTotalCents, paymentAmountCents, verifiedAmountCents, currency } = input;
  if (currency !== 'ZAR') {
    throw new AppError('CURRENCY_UNSUPPORTED', 'Only ZAR is supported', 400);
  }
  if (
    !Number.isInteger(orderTotalCents) ||
    !Number.isInteger(paymentAmountCents) ||
    !Number.isInteger(verifiedAmountCents)
  ) {
    throw new AppError('AMOUNT_INVALID', 'Money amounts must be integer cents', 400);
  }
  if (orderTotalCents < 0 || paymentAmountCents < 0 || verifiedAmountCents < 0) {
    throw new AppError('AMOUNT_INVALID', 'Money amounts cannot be negative', 400);
  }
  if (paymentAmountCents !== orderTotalCents) {
    throw new AppError(
      'AMOUNT_MISMATCH',
      'Payment amount does not match order total',
      400,
    );
  }
  if (verifiedAmountCents !== paymentAmountCents) {
    throw new AppError(
      'AMOUNT_MISMATCH',
      'Provider amount does not match payment record',
      400,
    );
  }
}
