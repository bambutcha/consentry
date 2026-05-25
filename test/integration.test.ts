/**
 * End-to-end tests using a real Postgres via testcontainers.
 *
 * Requires Docker to be available; otherwise the whole suite is skipped so
 * `vitest` stays green on machines without docker. Run with docker:
 *
 *   docker info >/dev/null 2>&1 && pnpm test
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from 'testcontainers';
import type { FastifyInstance } from 'fastify';
import { createDb } from '../src/infrastructure/db/kysely.js';
import { createPreferencesRepository } from '../src/infrastructure/db/preferencesRepository.js';
import { createPoliciesRepository } from '../src/infrastructure/db/policiesRepository.js';
import { createPreferencesService } from '../src/application/preferencesService.js';
import { buildServer } from '../src/infrastructure/http/server.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const hasDocker = await checkDocker();
const d = hasDocker ? describe : describe.skip;

async function checkDocker(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

d('HTTP + Postgres integration', () => {
  let container: StartedPostgreSqlContainer;
  let app: FastifyInstance;
  let dbUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('nps')
      .withUsername('nps')
      .withPassword('nps')
      .start();
    dbUrl = container.getConnectionUri();

    // Apply migrations.
    const pool = new pg.Pool({ connectionString: dbUrl });
    const sql = await readFile(
      path.resolve(__dirname, '../migrations/001_init.sql'),
      'utf8',
    );
    await pool.query(sql);
    await pool.query(
      `INSERT INTO global_policies (notification_type, channel, region, effect, reason)
       VALUES ('marketing_sms', 'sms', 'EU', 'deny', 'no marketing sms in EU')`,
    );
    await pool.end();

    const db = createDb(dbUrl);
    const logger = createLogger('error');
    const service = createPreferencesService({
      preferences: createPreferencesRepository(db),
      policies: createPoliciesRepository(db),
      logger,
    });
    app = buildServer({ service, logger });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('returns defaults for a new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/new-user/preferences',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('new-user');
    const transactional = body.items.find(
      (i: { notificationType: string; channel: string }) =>
        i.notificationType === 'transactional_email' && i.channel === 'email',
    );
    expect(transactional.enabled).toBe(true);
  });

  it('disabling marketing_email is reflected and is idempotent', async () => {
    const payload = {
      items: [
        { notificationType: 'marketing_email', channel: 'email', enabled: false },
      ],
    };
    const first = await app.inject({
      method: 'POST',
      url: '/users/u1/preferences',
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-idempotent-replay']).toBe('false');

    const second = await app.inject({
      method: 'POST',
      url: '/users/u1/preferences',
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-idempotent-replay']).toBe('true');

    // Final state has marketing_email=false, transactional unchanged.
    const get = await app.inject({ method: 'GET', url: '/users/u1/preferences' });
    const items = get.json().items as Array<{
      notificationType: string; channel: string; enabled: boolean;
    }>;
    expect(items.find((i) => i.notificationType === 'marketing_email')?.enabled).toBe(false);
    expect(items.find((i) => i.notificationType === 'transactional_email')?.enabled).toBe(true);
  });

  it('quiet hours block marketing_push but allow transactional', async () => {
    await app.inject({
      method: 'POST',
      url: '/users/u2/preferences',
      payload: {
        items: [
          { notificationType: 'marketing_push', channel: 'push', enabled: true },
        ],
        quietHours: {
          start: '22:00',
          end: '08:00',
          timezone: 'Europe/Moscow',
          appliesTo: ['marketing_push'],
        },
      },
    });

    const blocked = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u2',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T21:30:00Z',
      },
    });
    expect(blocked.json()).toMatchObject({ decision: 'deny', reason: 'quiet_hours' });

    const allowed = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u2',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T21:30:00Z',
      },
    });
    expect(allowed.json().decision).toBe('allow');
  });

  it('global EU policy denies marketing_sms even if user opted in', async () => {
    await app.inject({
      method: 'POST',
      url: '/users/u3/preferences',
      payload: {
        items: [
          { notificationType: 'marketing_sms', channel: 'sms', enabled: true },
        ],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u3',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      },
    });
    expect(res.json()).toMatchObject({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });

  it('rejects invalid input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'u3',
        notificationType: 'not_a_type',
        channel: 'email',
        region: 'EU',
        datetime: '2026-05-21T10:00:00Z',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
