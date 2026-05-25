/**
 * Tiny home-grown migration runner.
 *
 * We deliberately do not pull in a migration framework: the schema is small,
 * and inspecting plain .sql files is the most reviewer-friendly format.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

async function ensureTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listFiles(direction: 'up' | 'down'): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const suffix = direction === 'up' ? '.sql' : '.down.sql';
  return entries
    .filter((f) => f.endsWith(suffix) && (direction === 'up' ? !f.endsWith('.down.sql') : true))
    .sort();
}

async function run(direction: 'up' | 'down'): Promise<void> {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const files = await listFiles(direction);
    const { rows: appliedRows } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations',
    );
    const applied = new Set(appliedRows.map((r) => r.name));

    if (direction === 'up') {
      for (const file of files) {
        const baseName = file;
        if (applied.has(baseName)) continue;
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO _migrations(name) VALUES ($1)', [baseName]);
          await client.query('COMMIT');
          console.log(`[migrate:up] applied ${baseName}`);
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      }
    } else {
      // Roll back the most recent migration only.
      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM _migrations ORDER BY applied_at DESC LIMIT 1',
      );
      const last = rows[0]?.name;
      if (!last) {
        console.log('[migrate:down] nothing to revert');
        return;
      }
      const downFile = last.replace(/\.sql$/, '.down.sql');
      const sql = await readFile(path.join(MIGRATIONS_DIR, downFile), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('DELETE FROM _migrations WHERE name = $1', [last]);
        await client.query('COMMIT');
        console.log(`[migrate:down] reverted ${last}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

const direction = (process.argv[2] === 'down' ? 'down' : 'up') as 'up' | 'down';
run(direction).catch((err) => {
  console.error(err);
  process.exit(1);
});
