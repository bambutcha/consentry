import type { Generated, ColumnType } from 'kysely';
import type {
  Channel,
  NotificationType,
  QuietHours,
  Region,
} from '../../domain/types.js';

/**
 * `JsonColumn<T>` represents a Postgres `jsonb` column. We read it as `T`
 * (Postgres returns parsed JSON), and on write we always serialize to a
 * `string` via `JSON.stringify(...)`. Using a plain `ColumnType` keeps the
 * types simple and avoids Kysely's `JSONColumnType` constraint (which
 * forbids `null` inside the union).
 */
type JsonColumn<TRead> = ColumnType<TRead, string | null, string | null>;

export interface UserPreferencesRow {
  user_id: string;
  quiet_hours: JsonColumn<QuietHours | null>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface UserPreferenceItemRow {
  user_id: string;
  notification_type: NotificationType;
  channel: Channel;
  enabled: boolean;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GlobalPolicyRow {
  id: Generated<string>;
  notification_type: NotificationType | null;
  channel: Channel | null;
  region: Region | null;
  effect: 'deny';
  reason: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface PreferenceChangeLogRow {
  id: Generated<number>;
  user_id: string;
  /** Hash of the canonical request body — used for idempotency. */
  idempotency_key: string;
  applied_at: ColumnType<Date, Date | string | undefined, never>;
  payload: JsonColumn<unknown>;
}

export interface DB {
  user_preferences: UserPreferencesRow;
  user_preference_items: UserPreferenceItemRow;
  global_policies: GlobalPolicyRow;
  preference_change_log: PreferenceChangeLogRow;
}
