import { describe, expect, it } from 'vitest';

const ALLOWED: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: [],
  rejected: ['draft', 'submitted'],
};

function canTransition(from: string, to: string): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

describe('seller application state machine', () => {
  it('allows draft to submitted', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
  });

  it('allows rejected resubmission path', () => {
    expect(canTransition('rejected', 'draft')).toBe(true);
    expect(canTransition('rejected', 'submitted')).toBe(true);
  });

  it('blocks edits from approved', () => {
    expect(canTransition('approved', 'draft')).toBe(false);
    expect(canTransition('approved', 'rejected')).toBe(false);
  });

  it('blocks skipping review incorrectly from draft to approved', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
  });
});
