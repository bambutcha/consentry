import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PreferencesService } from '../../application/preferencesService.js';
import type { AppLogger } from '../logging/logger.js';
import {
  evaluateSchema,
  updatePreferencesSchema,
} from './schemas.js';

export interface BuildServerDeps {
  service: PreferencesService;
  logger: AppLogger;
}

export function buildServer(deps: BuildServerDeps): FastifyInstance {
  // Fastify v4 accepts a pino instance directly; cast keeps both sides happy
  // without forcing the rest of the app onto Fastify's logger surface.
  const app = Fastify({ logger: deps.logger as unknown as FastifyBaseLogger });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get<{ Params: { id: string } }>(
    '/users/:id/preferences',
    async (req, reply) => {
      const userId = req.params.id;
      const prefs = await deps.service.get(userId);
      reply.send(serializePreferences(prefs));
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/users/:id/preferences',
    async (req, reply) => {
      const body = updatePreferencesSchema.parse(req.body);
      const idempotencyKey = headerValue(req.headers['idempotency-key']);

      const result = await deps.service.update(
        req.params.id,
        {
          items: body.items,
          quietHours: body.quietHours,
        },
        idempotencyKey,
        req.body,
      );

      reply
        .header('x-idempotent-replay', String(result.alreadyApplied))
        .send(serializePreferences(result.preferences));
    },
  );

  app.post<{ Body: unknown }>('/evaluate', async (req, reply) => {
    const body = evaluateSchema.parse(req.body);
    const decision = await deps.service.evaluate({
      userId: body.userId,
      notificationType: body.notificationType,
      channel: body.channel,
      region: body.region,
      datetime: new Date(body.datetime),
    });
    reply.send(decision);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      reply.status(400).send({
        error: 'validation_error',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    reply.status(500).send({ error: 'internal_error' });
  });

  return app;
}

function headerValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function serializePreferences(prefs: {
  userId: string;
  items: { notificationType: string; channel: string; enabled: boolean }[];
  quietHours: unknown;
  updatedAt: Date;
}): unknown {
  return {
    userId: prefs.userId,
    items: prefs.items,
    quietHours: prefs.quietHours,
    updatedAt: prefs.updatedAt.toISOString(),
  };
}
