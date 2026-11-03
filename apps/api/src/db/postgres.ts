import postgres from 'postgres';
import type { Env } from '../config/env.js';

type Sql = ReturnType<typeof postgres>;

let sql: Sql | undefined;

export function initPostgres(env: Env): Sql {
  if (sql) return sql;
  if (!env.SUPABASE_DB_URL) {
    throw new Error('SUPABASE_DB_URL is required for the API data store');
  }
  sql = postgres(env.SUPABASE_DB_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false, // compatible with PgBouncer transaction mode
  });
  return sql;
}

export function getSql(): Sql {
  if (!sql) {
    throw new Error('Postgres not initialised — call initPostgres() first');
  }
  return sql;
}

export async function closePostgres(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
}

export type { Sql };
