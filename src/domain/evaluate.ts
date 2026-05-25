import { DEFAULT_PREFERENCES } from './defaults.js';
import { isInsideQuietHours } from './quietHours.js';
import type {
  EvaluateDecision,
  EvaluateInput,
  GlobalPolicy,
  PreferenceItem,
  UserPreferences,
} from './types.js';

/**
 * Decide whether a single notification may be sent.
 *
 * Order of precedence (highest first):
 *   1. Global policies (compliance/region). Cannot be overridden by user.
 *   2. User preference (explicit or default) — must be `enabled`.
 *   3. Quiet hours window for the user.
 *
 * Returning the first matching deny keeps the reason actionable for callers
 * and is also what observability dashboards need (one reason per decision).
 */
export function evaluate(
  input: EvaluateInput,
  preferences: UserPreferences | null,
  policies: ReadonlyArray<GlobalPolicy>,
): EvaluateDecision {
  // 1. Global policies
  const policy = policies.find((p) => policyMatches(p, input));
  if (policy) {
    return {
      decision: 'deny',
      reason: 'blocked_by_global_policy',
      detail: policy.reason,
    };
  }

  // 2. User preference (falling back to defaults if user has no entry)
  const item =
    findItem(preferences?.items ?? [], input.notificationType, input.channel) ??
    findItem(DEFAULT_PREFERENCES, input.notificationType, input.channel);

  if (!item || !item.enabled) {
    return { decision: 'deny', reason: 'disabled_by_user' };
  }

  // 3. Quiet hours
  const qh = preferences?.quietHours ?? null;
  if (
    qh &&
    qh.appliesTo.includes(input.notificationType) &&
    isInsideQuietHours(qh, input.datetime)
  ) {
    return { decision: 'deny', reason: 'quiet_hours' };
  }

  return { decision: 'allow', reason: 'allowed' };
}

function findItem(
  items: ReadonlyArray<PreferenceItem>,
  type: PreferenceItem['notificationType'],
  channel: PreferenceItem['channel'],
): PreferenceItem | undefined {
  return items.find(
    (i) => i.notificationType === type && i.channel === channel,
  );
}

function policyMatches(p: GlobalPolicy, input: EvaluateInput): boolean {
  if (p.notificationType !== null && p.notificationType !== input.notificationType) return false;
  if (p.channel !== null && p.channel !== input.channel) return false;
  if (p.region !== null && p.region !== input.region) return false;
  return true;
}
