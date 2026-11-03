import { describe, expect, it } from 'vitest';
import { applyPatch, FieldValue, isDeleteFieldValue } from './fieldValue.js';

describe('FieldValue.delete', () => {
  it('removes keys on patch', () => {
    const next = applyPatch(
      { a: 1, b: 2, c: 3 },
      { b: FieldValue.delete(), c: 9 },
    );
    expect(next).toEqual({ a: 1, c: 9 });
    expect(isDeleteFieldValue(FieldValue.delete())).toBe(true);
  });
});
