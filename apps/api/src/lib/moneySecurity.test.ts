import { describe, expect, it } from 'vitest';
import {
  assertMoneyAmountsMatch,
  last4Account,
  maskAccountNumber,
  redactBankForAudit,
  safeEqualString,
} from './moneySecurity.js';

describe('moneySecurity', () => {
  it('compares signatures in constant time', () => {
    expect(safeEqualString('abc', 'abc')).toBe(true);
    expect(safeEqualString('abc', 'abd')).toBe(false);
    expect(safeEqualString('abc', 'ab')).toBe(false);
  });

  it('masks account numbers', () => {
    expect(maskAccountNumber('1234567890')).toBe('******7890');
    expect(last4Account('1234567890')).toBe('7890');
  });

  it('redacts bank for audit', () => {
    const r = redactBankForAudit({
      accountName: 'Acme Pty',
      bankName: 'FNB',
      accountNumber: '1234567890',
      branchCode: '250655',
    });
    expect(r.accountNumberLast4).toBe('7890');
    expect(r.accountName).toBe('[redacted]');
    expect(JSON.stringify(r)).not.toContain('1234567890');
  });

  it('rejects amount mismatches', () => {
    expect(() =>
      assertMoneyAmountsMatch({
        orderTotalCents: 1000,
        paymentAmountCents: 1000,
        verifiedAmountCents: 1000,
        currency: 'ZAR',
      }),
    ).not.toThrow();
    expect(() =>
      assertMoneyAmountsMatch({
        orderTotalCents: 1000,
        paymentAmountCents: 900,
        verifiedAmountCents: 900,
        currency: 'ZAR',
      }),
    ).toThrow(/order total/i);
  });
});
