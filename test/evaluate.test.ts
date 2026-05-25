import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/domain/evaluate.js';
import type {
  GlobalPolicy,
  UserPreferences,
} from '../src/domain/types.js';

const noPolicies: GlobalPolicy[] = [];

const baseUser: UserPreferences = {
  userId: 'user-1',
  items: [],
  quietHours: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('evaluate', () => {
  it('allows transactional_email by default for new user', () => {
    const decision = evaluate(
      {
        userId: 'user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'RU',
        datetime: new Date('2026-05-21T10:00:00Z'),
      },
      null,
      noPolicies,
    );
    expect(decision.decision).toBe('allow');
  });

  it('denies marketing_email by default', () => {
    const decision = evaluate(
      {
        userId: 'user-1',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'RU',
        datetime: new Date('2026-05-21T10:00:00Z'),
      },
      null,
      noPolicies,
    );
    expect(decision).toEqual({ decision: 'deny', reason: 'disabled_by_user' });
  });

  it('honors user override that disables marketing further', () => {
    const decision = evaluate(
      {
        userId: 'user-1',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'RU',
        datetime: new Date('2026-05-21T10:00:00Z'),
      },
      {
        ...baseUser,
        items: [{ notificationType: 'transactional_email', channel: 'email', enabled: false }],
      },
      noPolicies,
    );
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toBe('disabled_by_user');
  });

  it('global policy overrides user opt-in', () => {
    const policies: GlobalPolicy[] = [
      {
        id: 'p1',
        notificationType: 'marketing_sms',
        channel: null,
        region: 'EU',
        effect: 'deny',
        reason: 'no marketing sms in EU',
      },
    ];

    const decision = evaluate(
      {
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: new Date('2026-05-21T10:00:00Z'),
      },
      {
        ...baseUser,
        items: [{ notificationType: 'marketing_sms', channel: 'sms', enabled: true }],
      },
      policies,
    );
    expect(decision).toMatchObject({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });

  it('blocks marketing push during quiet hours but allows transactional', () => {
    const user: UserPreferences = {
      ...baseUser,
      items: [
        { notificationType: 'marketing_push', channel: 'push', enabled: true },
        { notificationType: 'transactional_push', channel: 'push', enabled: true },
      ],
      quietHours: {
        start: '22:00',
        end: '08:00',
        timezone: 'Europe/Moscow',
        appliesTo: ['marketing_push'],
      },
    };
    const instant = new Date('2026-05-21T21:30:00Z'); // 00:30 Moscow

    const marketing = evaluate(
      {
        userId: 'user-1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: instant,
      },
      user,
      noPolicies,
    );
    expect(marketing).toEqual({ decision: 'deny', reason: 'quiet_hours' });

    const transactional = evaluate(
      {
        userId: 'user-1',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'RU',
        datetime: instant,
      },
      user,
      noPolicies,
    );
    expect(transactional.decision).toBe('allow');
  });
});
