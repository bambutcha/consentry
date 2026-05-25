import type { PreferenceItem } from './types.js';

/**
 * Default preferences for a brand-new user.
 *
 * Anything not present in this matrix is treated as `disabled` by the
 * evaluation engine. Keeping defaults conservative for marketing is the
 * safer product choice.
 */
export const DEFAULT_PREFERENCES: ReadonlyArray<PreferenceItem> = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'security_alert', channel: 'email', enabled: true },
  { notificationType: 'security_alert', channel: 'push', enabled: true },
  { notificationType: 'security_alert', channel: 'sms', enabled: true },
  { notificationType: 'transactional_push', channel: 'push', enabled: true },
  { notificationType: 'transactional_sms', channel: 'sms', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
  { notificationType: 'marketing_push', channel: 'push', enabled: false },
  { notificationType: 'marketing_sms', channel: 'sms', enabled: false },
];
