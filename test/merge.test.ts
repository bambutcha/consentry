import { describe, expect, it } from 'vitest';
import { effectivePreferences } from '../src/domain/merge.js';

describe('effectivePreferences', () => {
  it('fills in defaults and applies user overrides', () => {
    const result = effectivePreferences({
      userId: 'u',
      updatedAt: new Date(),
      quietHours: null,
      items: [
        { notificationType: 'marketing_email', channel: 'email', enabled: true },
      ],
    });

    const marketing = result.items.find(
      (i) => i.notificationType === 'marketing_email' && i.channel === 'email',
    );
    expect(marketing?.enabled).toBe(true);

    const transactional = result.items.find(
      (i) => i.notificationType === 'transactional_email' && i.channel === 'email',
    );
    expect(transactional?.enabled).toBe(true);
  });
});
