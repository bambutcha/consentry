import { z } from 'zod';
import { CHANNELS, NOTIFICATION_TYPES } from '../../domain/types.js';

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const channelSchema = z.enum(CHANNELS);

export const quietHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1),
  appliesTo: z.array(notificationTypeSchema).min(1),
});

export const preferenceItemSchema = z.object({
  notificationType: notificationTypeSchema,
  channel: channelSchema,
  enabled: z.boolean(),
});

export const updatePreferencesSchema = z
  .object({
    items: z.array(preferenceItemSchema).optional(),
    quietHours: quietHoursSchema.nullable().optional(),
  })
  .refine(
    (v) => v.items !== undefined || v.quietHours !== undefined,
    { message: 'At least one of items or quietHours must be provided' },
  );

export const evaluateSchema = z.object({
  userId: z.string().min(1),
  notificationType: notificationTypeSchema,
  channel: channelSchema,
  region: z.string().min(1),
  datetime: z.string().datetime(),
});

export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>;
export type EvaluateBody = z.infer<typeof evaluateSchema>;
