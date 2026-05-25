import { createHash } from 'node:crypto';
import { effectivePreferences } from '../domain/merge.js';
import { evaluate } from '../domain/evaluate.js';
import { validateQuietHours } from '../domain/quietHours.js';
import type {
  EvaluateDecision,
  EvaluateInput,
  UserPreferences,
} from '../domain/types.js';
import type {
  PreferencesRepository,
  PreferenceUpdate,
} from '../infrastructure/db/preferencesRepository.js';
import type { PoliciesRepository } from '../infrastructure/db/policiesRepository.js';
import type { AppLogger } from '../infrastructure/logging/logger.js';

export interface PreferencesService {
  get(userId: string): Promise<UserPreferences>;
  update(
    userId: string,
    update: PreferenceUpdate,
    idempotencyKey: string | undefined,
    rawPayload: unknown,
  ): Promise<{ preferences: UserPreferences; alreadyApplied: boolean }>;
  evaluate(input: EvaluateInput): Promise<EvaluateDecision>;
}

export function createPreferencesService(deps: {
  preferences: PreferencesRepository;
  policies: PoliciesRepository;
  logger: AppLogger;
}): PreferencesService {
  const { preferences, policies, logger } = deps;

  return {
    async get(userId) {
      const stored = await preferences.getOrCreate(userId);
      return effectivePreferences(stored);
    },

    async update(userId, update, idempotencyKey, rawPayload) {
      if (update.quietHours) validateQuietHours(update.quietHours);

      // Derive a deterministic key from the canonical payload if the client
      // did not supply one. This makes replays idempotent even without an
      // explicit header — bit-for-bit identical requests collapse.
      const key = idempotencyKey ?? hashPayload(rawPayload);

      const result = await preferences.apply(userId, update, key, rawPayload);

      logger.info(
        {
          event: 'preferences.updated',
          userId,
          idempotencyKey: key,
          alreadyApplied: result.alreadyApplied,
          changedItems: update.items?.length ?? 0,
          quietHoursTouched: update.quietHours !== undefined,
        },
        'preferences updated',
      );

      return {
        preferences: effectivePreferences(result.preferences),
        alreadyApplied: result.alreadyApplied,
      };
    },

    async evaluate(input) {
      const [stored, currentPolicies] = await Promise.all([
        preferences.getOrCreate(input.userId),
        policies.list(),
      ]);
      const decision = evaluate(input, stored, currentPolicies);

      logger.info(
        {
          event: 'evaluate.decision',
          userId: input.userId,
          notificationType: input.notificationType,
          channel: input.channel,
          region: input.region,
          datetime: input.datetime.toISOString(),
          decision: decision.decision,
          reason: decision.reason,
        },
        'evaluate decision',
      );

      return decision;
    },
  };
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/** Stable JSON serialization with sorted keys. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${body}}`;
}
