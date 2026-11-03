import { randomBytes } from 'node:crypto';
import { tableFor } from './collections.js';
import { applyPatch, isDeleteFieldValue } from './fieldValue.js';
import { getSql, type Sql } from './postgres.js';
import type { DocData } from './types.js';

export type DocumentData = DocData;

type WhereOp = '==' | 'in' | '<=' | '>=' | '<' | '>';
type WhereClause = { field: string; op: WhereOp; value: unknown };
type OrderClause = { field: string; direction: 'asc' | 'desc' };

function autoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(20);
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars[bytes[i]! % chars.length];
  }
  return id;
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}


export class DocumentSnapshot {
  constructor(
    readonly id: string,
    readonly ref: DocumentReference,
    private readonly _data: DocumentData | undefined,
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  /** Returns document fields; empty object when missing (check `exists`). */
  data(): DocumentData {
    return this._data ? { ...this._data } : {};
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }
}

type TxOp =
  | { kind: 'set'; ref: DocumentReference; data: DocumentData; merge: boolean }
  | { kind: 'update'; ref: DocumentReference; data: DocumentData }
  | { kind: 'delete'; ref: DocumentReference };

export class Transaction {
  private readonly pending: TxOp[] = [];
  private writesStarted = false;

  constructor(private readonly sql: Sql) {}

  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    if (this.writesStarted) {
      throw new Error('Firestore transactions require all reads before writes');
    }
    return ref.getWithSql(this.sql);
  }

  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): Transaction {
    this.writesStarted = true;
    this.pending.push({ kind: 'set', ref, data, merge: Boolean(options?.merge) });
    return this;
  }

  update(ref: DocumentReference, data: DocumentData): Transaction {
    this.writesStarted = true;
    this.pending.push({ kind: 'update', ref, data });
    return this;
  }

  delete(ref: DocumentReference): Transaction {
    this.writesStarted = true;
    this.pending.push({ kind: 'delete', ref });
    return this;
  }

  async commit(): Promise<void> {
    for (const op of this.pending) {
      if (op.kind === 'set') {
        await op.ref.setWithSql(this.sql, op.data, { merge: op.merge });
      } else if (op.kind === 'update') {
        await op.ref.updateWithSql(this.sql, op.data);
      } else {
        await op.ref.deleteWithSql(this.sql);
      }
    }
  }
}

export class WriteBatch {
  private readonly ops: TxOp[] = [];

  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): WriteBatch {
    this.ops.push({ kind: 'set', ref, data, merge: Boolean(options?.merge) });
    return this;
  }

  update(ref: DocumentReference, data: DocumentData): WriteBatch {
    this.ops.push({ kind: 'update', ref, data });
    return this;
  }

  delete(ref: DocumentReference): WriteBatch {
    this.ops.push({ kind: 'delete', ref });
    return this;
  }

  async commit(): Promise<void> {
    const sql = getSql();
    await sql.begin(async (tx) => {
      for (const op of this.ops) {
        if (op.kind === 'set') {
          await op.ref.setWithSql(tx as unknown as Sql, op.data, { merge: op.merge });
        } else if (op.kind === 'update') {
          await op.ref.updateWithSql(tx as unknown as Sql, op.data);
        } else {
          await op.ref.deleteWithSql(tx as unknown as Sql);
        }
      }
    });
  }
}

export class DocumentReference {
  constructor(
    readonly parent: CollectionReference,
    readonly id: string,
  ) {}

  get path(): string {
    return `${this.parent.id}/${this.id}`;
  }

  async get(): Promise<DocumentSnapshot> {
    return this.getWithSql(getSql());
  }

  async getWithSql(sql: Sql): Promise<DocumentSnapshot> {
    const table = quoteIdent(tableFor(this.parent.id));
    const rows = await sql.unsafe(`SELECT data FROM ${table} WHERE id = $1 LIMIT 1`, [this.id] as never[]);
    const row = rows[0] as { data: DocumentData | string } | undefined;
    return new DocumentSnapshot(this.id, this, normalizeRowData(row?.data));
  }

  async set(data: DocumentData, options?: { merge?: boolean }): Promise<void> {
    return this.setWithSql(getSql(), data, options);
  }

  async setWithSql(sql: Sql, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
    const table = quoteIdent(tableFor(this.parent.id));
    if (options?.merge) {
      const existing = await this.getWithSql(sql);
      const merged = applyPatch(existing.data() ?? {}, data);
      await sql.unsafe(
        `INSERT INTO ${table} (id, data, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [this.id, merged] as never[],
      );
      return;
    }
    const clean = applyPatch({}, data);
    await sql.unsafe(
      `INSERT INTO ${table} (id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [this.id, clean] as never[],
    );
  }

  async update(data: DocumentData): Promise<void> {
    return this.updateWithSql(getSql(), data);
  }

  async updateWithSql(sql: Sql, data: DocumentData): Promise<void> {
    const existing = await this.getWithSql(sql);
    if (!existing.exists) {
      throw new Error(`No document to update: ${this.path}`);
    }
    const merged = applyPatch(existing.data()!, data);
    const table = quoteIdent(tableFor(this.parent.id));
    await sql.unsafe(
      `UPDATE ${table} SET data = $2::jsonb, updated_at = now() WHERE id = $1`,
      [this.id, merged] as never[],
    );
  }

  async delete(): Promise<void> {
    return this.deleteWithSql(getSql());
  }

  async deleteWithSql(sql: Sql): Promise<void> {
    const table = quoteIdent(tableFor(this.parent.id));
    await sql.unsafe(`DELETE FROM ${table} WHERE id = $1`, [this.id] as never[]);
  }
}

export class Query {
  private readonly filters: WhereClause[] = [];
  private orders: OrderClause[] = [];
  private limitCount: number | undefined;
  private startAfterSnap: DocumentSnapshot | undefined;

  constructor(protected readonly collectionName: string) {}

  where(field: string, op: WhereOp, value: unknown): Query {
    const next = this.clone();
    next.filters.push({ field, op, value });
    return next;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    const next = this.clone();
    next.orders.push({ field, direction });
    return next;
  }

  limit(n: number): Query {
    const next = this.clone();
    next.limitCount = n;
    return next;
  }

  startAfter(snap: DocumentSnapshot): Query {
    const next = this.clone();
    next.startAfterSnap = snap;
    return next;
  }

  protected clone(): Query {
    const q = new Query(this.collectionName);
    q.filters.push(...this.filters);
    q.orders.push(...this.orders);
    q.limitCount = this.limitCount;
    q.startAfterSnap = this.startAfterSnap;
    return q;
  }

  async get(): Promise<QuerySnapshot> {
    const table = quoteIdent(tableFor(this.collectionName));
    const params: unknown[] = [];
    const whereParts: string[] = [];

    for (const filter of this.filters) {
      // Postgres: jsonb keys must be single-quoted text, not "double-quoted" identifiers.
      const keyLit = `'${filter.field.replace(/'/g, "''")}'`;
      const jsonPath = `data->${keyLit}`;
      const textPath = `data->>${keyLit}`;
      if (filter.op === '==') {
        // Compare via text extraction so bool/number/string match Firestore-style equality.
        params.push(stringifyFilterValue(filter.value));
        whereParts.push(`${textPath} = $${params.length}`);
      } else if (filter.op === 'in') {
        const values = filter.value as unknown[];
        params.push(values.map((v) => stringifyFilterValue(v)));
        whereParts.push(`${textPath} = ANY($${params.length}::text[])`);
      } else {
        params.push(stringifyFilterValue(filter.value));
        whereParts.push(`${textPath} ${filter.op} $${params.length}`);
      }
    }

    if (this.startAfterSnap && this.orders.length > 0) {
      const order = this.orders[0]!;
      const cursorData = this.startAfterSnap.data() ?? {};
      const cursorVal = cursorData[order.field];
      const cursorId = this.startAfterSnap.id;
      params.push(cursorVal == null ? null : String(cursorVal));
      const valParam = params.length;
      params.push(cursorId);
      const idParam = params.length;
      const orderKey = `'${order.field.replace(/'/g, "''")}'`;
      const textPath = `data->>${orderKey}`;
      if (order.direction === 'desc') {
        whereParts.push(
          `(${textPath} < $${valParam} OR (${textPath} = $${valParam} AND id < $${idParam}))`,
        );
      } else {
        whereParts.push(
          `(${textPath} > $${valParam} OR (${textPath} = $${valParam} AND id > $${idParam}))`,
        );
      }
    }

    let sqlText = `SELECT id, data FROM ${table}`;
    if (whereParts.length) {
      sqlText += ` WHERE ${whereParts.join(' AND ')}`;
    }

    if (this.orders.length) {
      const orderSql = this.orders
        .map((o) => {
          const keyLit = `'${o.field.replace(/'/g, "''")}'`;
          return `data->>${keyLit} ${o.direction.toUpperCase()}`;
        })
        .join(', ');
      sqlText += ` ORDER BY ${orderSql}, id ASC`;
    }

    if (this.limitCount != null) {
      params.push(this.limitCount);
      sqlText += ` LIMIT $${params.length}`;
    }

    const rows = (await getSql().unsafe(sqlText, params as never[])) as Array<{
      id: string;
      data: DocumentData | string;
    }>;

    const parent = new CollectionReference(this.collectionName);
    const docs = rows.map(
      (row) =>
        new DocumentSnapshot(
          row.id,
          new DocumentReference(parent, row.id),
          normalizeRowData(row.data),
        ),
    );
    return new QuerySnapshot(docs);
  }
}

function normalizeRowData(raw: DocumentData | string | undefined): DocumentData | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as DocumentData;
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return raw;
}

function stringifyFilterValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export class CollectionReference extends Query {
  readonly id: string;

  constructor(name: string) {
    super(name);
    this.id = name;
  }

  doc(id?: string): DocumentReference {
    return new DocumentReference(this, id && id.length > 0 ? id : autoId());
  }

  /** Firestore-compatible auto-id insert. */
  async add(data: DocumentData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class FirestoreStore {
  collection(name: string): CollectionReference {
    return new CollectionReference(name);
  }

  batch(): WriteBatch {
    return new WriteBatch();
  }

  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const sql = getSql();
    return sql.begin(async (txSql) => {
      const tx = new Transaction(txSql as unknown as Sql);
      const result = await fn(tx);
      await tx.commit();
      return result;
    });
  }
}

export function createStore(): FirestoreStore {
  return new FirestoreStore();
}

export function sanitizeForWrite(data: DocumentData): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (isDeleteFieldValue(v)) continue;
    out[k] = v;
  }
  return out;
}
