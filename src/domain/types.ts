/**
 * Domain types.
 *
 * These are the canonical names. The list is intentionally closed — a wider
 * catalog should be configurable via DB, but for clarity of the test task we
 * fix a sensible set.
 */

export const NOTIFICATION_TYPES = [
  'transactional_email',
  'marketing_email',
  'transactional_push',
  'marketing_push',
  'transactional_sms',
  'marketing_sms',
  'security_alert',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CHANNELS = ['email', 'sms', 'push', 'messenger'] as const;
export type Channel = (typeof CHANNELS)[number];

/** ISO 3166-1 alpha-2 or a synthetic bloc like "EU". Free-form on purpose. */
export type Region = string;

/** IANA tz, e.g. "Europe/Moscow". */
export type TimeZone = string;

export interface QuietHours {
  /** "HH:mm" inclusive lower bound */
  start: string;
  /** "HH:mm" exclusive upper bound. May wrap past midnight. */
  end: string;
  timezone: TimeZone;
  /** Notification types that must be suppressed within the window. */
  appliesTo: NotificationType[];
}

/** A single (type, channel) preference bit. */
export interface PreferenceItem {
  notificationType: NotificationType;
  channel: Channel;
  enabled: boolean;
}

export interface UserPreferences {
  userId: string;
  items: PreferenceItem[];
  quietHours: QuietHours | null;
  updatedAt: Date;
}

export interface GlobalPolicy {
  id: string;
  /** null = applies to any type */
  notificationType: NotificationType | null;
  /** null = applies to any channel */
  channel: Channel | null;
  /** null = applies to any region */
  region: Region | null;
  /** "deny" only for now — allow-lists are out of scope. */
  effect: 'deny';
  reason: string;
}

export interface EvaluateInput {
  userId: string;
  notificationType: NotificationType;
  channel: Channel;
  region: Region;
  /** Moment at which the send is considered. */
  datetime: Date;
}

export type DenyReason =
  | 'blocked_by_global_policy'
  | 'disabled_by_user'
  | 'quiet_hours';

export type EvaluateDecision =
  | { decision: 'allow'; reason: 'allowed' }
  | { decision: 'deny'; reason: DenyReason; detail?: string };
