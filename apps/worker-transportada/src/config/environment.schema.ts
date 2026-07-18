/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { WorkerEnvironment } from '../shared/worker.types.js'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const RABBITMQ_PROTOCOLS = ['amqp:', 'amqps:'] as const

const workerEnvironmentSchema = z
  .object({
    APP_ENV: z.string().trim().min(1).default('local'),
    DATABASE_URL: protocolUrl(POSTGRESQL_PROTOCOLS),
    FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS: z.coerce.number().int().min(0).max(30_000).default(0),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    QUEUE_PREFIX: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    RABBITMQ_URL: protocolUrl(RABBITMQ_PROTOCOLS),
    WORKER_PORT: z.coerce.number().int().min(0).max(65_535).default(53_002),
    WORKER_PREFETCH: z.coerce.number().int().min(1).max(100).default(1),
  })
  .superRefine((environment, context) => {
    if (environment.APP_ENV === 'production' && environment.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED) {
      context.addIssue({
        code: 'custom',
        message: 'The foundation synthetic consumer is forbidden in production',
        path: ['FOUNDATION_SYNTHETIC_CONSUMER_ENABLED'],
      })
    }
  })

export class WorkerConfigurationError extends Error {
  override readonly name = 'WorkerConfigurationError'

  constructor() {
    super('Invalid worker environment configuration')
  }
}

export function parseWorkerEnvironment(
  environment: Record<string, string | undefined>,
): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    throw new WorkerConfigurationError()
  }

  return {
    appEnv: result.data.APP_ENV,
    databaseUrl: result.data.DATABASE_URL,
    foundationSyntheticConsumerEnabled: result.data.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED,
    foundationSyntheticEffectDelayMs: result.data.FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS,
    logLevel: result.data.LOG_LEVEL,
    port: result.data.WORKER_PORT,
    prefetch: result.data.WORKER_PREFETCH,
    queuePrefix: result.data.QUEUE_PREFIX,
    rabbitMqUrl: result.data.RABBITMQ_URL,
  }
}

function protocolUrl<const TProtocols extends readonly string[]>(
  protocols: TProtocols,
): z.ZodString {
  return z
    .string()
    .url()
    .refine((value) => protocols.includes(new URL(value).protocol), {
      message: 'Unsupported connection protocol',
    })
}
