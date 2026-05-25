import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema.js';

export function createDb(databaseUrl: string): Kysely<DB> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}
