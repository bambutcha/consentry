import type { Kysely } from 'kysely';
import type { DB } from './schema.js';
import type { GlobalPolicy } from '../../domain/types.js';

export interface PoliciesRepository {
  list(): Promise<GlobalPolicy[]>;
}

export function createPoliciesRepository(db: Kysely<DB>): PoliciesRepository {
  return {
    async list() {
      const rows = await db.selectFrom('global_policies').selectAll().execute();
      return rows.map((r) => ({
        id: r.id,
        notificationType: r.notification_type,
        channel: r.channel,
        region: r.region,
        effect: r.effect,
        reason: r.reason,
      }));
    },
  };
}
