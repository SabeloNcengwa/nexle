const DELETE_SENTINEL = Symbol('FieldValue.delete');

export type DeleteFieldValue = { readonly __delete: true; readonly [Symbol.toStringTag]: string };

export const FieldValue = {
  delete(): DeleteFieldValue {
    return { __delete: true, [Symbol.toStringTag]: 'FieldValueDelete' } as DeleteFieldValue;
  },
};

export function isDeleteFieldValue(value: unknown): value is DeleteFieldValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __delete?: boolean }).__delete === true
  );
}

/** Apply a patch onto existing document data, honouring FieldValue.delete(). */
export function applyPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (isDeleteFieldValue(value) || value === DELETE_SENTINEL) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}
