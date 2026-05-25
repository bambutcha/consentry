/**
 * Seed: one well-known global policy used by the example in the task PDF
 * — marketing_sms is disallowed in the EU.
 */
import pg from 'pg';
import { loadEnv } from '../../config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    await pool.query(
      `
      INSERT INTO global_policies (notification_type, channel, region, effect, reason)
      SELECT 'marketing_sms', 'sms', 'EU', 'deny', 'marketing_sms is not allowed in EU'
      WHERE NOT EXISTS (
        SELECT 1 FROM global_policies
        WHERE notification_type = 'marketing_sms' AND region = 'EU'
      );
      `,
    );
    console.log('[seed] ok');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
