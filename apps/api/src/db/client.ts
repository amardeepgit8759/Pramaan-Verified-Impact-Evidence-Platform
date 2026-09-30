import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

/**
 * Neon's console hands out `?sslmode=require`. node-postgres 8 already treats `require`,
 * `prefer` and `verify-ca` as `verify-full` but prints a security warning, and pg 9 will
 * switch them to libpq's weaker meaning (encrypt without checking the certificate). Pin
 * full verification, so a connection string can be pasted exactly as Neon shows it.
 */
export function withVerifiedTls(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== 'require' && mode !== 'prefer' && mode !== 'verify-ca') return databaseUrl;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: withVerifiedTls(databaseUrl), max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
