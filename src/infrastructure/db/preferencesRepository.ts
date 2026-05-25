import type { Kysely, Transaction } from 'kysely';
import type { DB } from './schema.js';
import type {
  PreferenceItem,
  QuietHours,
  UserPreferences,
} from '../../domain/types.js';

export interface PreferenceUpdate {
  /** Toggle items to set. Existing items not listed remain untouched. */
  items?: PreferenceItem[];
  /** Pass `null` explicitly to clear quiet hours, omit to leave as-is. */
  quietHours?: QuietHours | null;
}

export interface PreferencesRepository {
  getOrCreate(userId: string): Promise<UserPreferences>;
  apply(
    userId: string,
    update: PreferenceUpdate,
    idempotencyKey: string,
    rawPayload: unknown,
  ): Promise<{ preferences: UserPreferences; alreadyApplied: boolean }>;
}

export function createPreferencesRepository(
  db: Kysely<DB>,
): PreferencesRepository {
  return {
    async getOrCreate(userId) {
      return await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('user_preferences')
          .values({ user_id: userId, quiet_hours: null })
          .onConflict((oc) => oc.column('user_id').doNothing())
          .execute();
        return await loadPreferences(trx, userId);
      });
    },

    async apply(userId, update, idempotencyKey, rawPayload) {
      return await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('user_preferences')
          .values({ user_id: userId, quiet_hours: null })
          .onConflict((oc) => oc.column('user_id').doNothing())
          .execute();

        const seen = await trx
          .selectFrom('preference_change_log')
          .select('id')
          .where('user_id', '=', userId)
          .where('idempotency_key', '=', idempotencyKey)
          .executeTakeFirst();

        if (seen) {
          return {
            preferences: await loadPreferences(trx, userId),
            alreadyApplied: true,
          };
        }

        if (update.items && update.items.length > 0) {
          await trx
            .insertInto('user_preference_items')
            .values(
              update.items.map((i) => ({
                user_id: userId,
                notification_type: i.notificationType,
                channel: i.channel,
                enabled: i.enabled,
                updated_at: new Date(),
              })),
            )
            .onConflict((oc) =>
              oc
                .columns(['user_id', 'notification_type', 'channel'])
                .doUpdateSet({
                  enabled: (eb) => eb.ref('excluded.enabled'),
                  updated_at: (eb) => eb.ref('excluded.updated_at'),
                }),
            )
            .execute();
        }

        if (update.quietHours !== undefined) {
          await trx
            .updateTable('user_preferences')
            .set({
              quiet_hours:
                update.quietHours === null
                  ? null
                  : JSON.stringify(update.quietHours),
              updated_at: new Date(),
            })
            .where('user_id', '=', userId)
            .execute();
        }

        await trx
          .insertInto('preference_change_log')
          .values({
            user_id: userId,
            idempotency_key: idempotencyKey,
            payload: JSON.stringify(rawPayload),
          })
          .onConflict((oc) =>
            oc.columns(['user_id', 'idempotency_key']).doNothing(),
          )
          .execute();

        return {
          preferences: await loadPreferences(trx, userId),
          alreadyApplied: false,
        };
      });
    },
  };
}

async function loadPreferences(
  trx: Transaction<DB>,
  userId: string,
): Promise<UserPreferences> {
  const head = await trx
    .selectFrom('user_preferences')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();

  const items = await trx
    .selectFrom('user_preference_items')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();

  return {
    userId,
    items: items.map((r) => ({
      notificationType: r.notification_type,
      channel: r.channel,
      enabled: r.enabled,
    })),
    quietHours: (head.quiet_hours as QuietHours | null) ?? null,
    updatedAt: head.updated_at,
  };
}
