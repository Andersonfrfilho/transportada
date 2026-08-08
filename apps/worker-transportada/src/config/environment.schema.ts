/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type {
  CteTechnicalResponsibleEnvironment,
  WorkerEnvironment,
} from '../shared/worker.types.js'

const TECHNICAL_RESPONSIBLE_KEYS = [
  'CTE_TECHNICAL_RESPONSIBLE_CNPJ',
  'CTE_TECHNICAL_RESPONSIBLE_CONTACT',
  'CTE_TECHNICAL_RESPONSIBLE_EMAIL',
  'CTE_TECHNICAL_RESPONSIBLE_PHONE',
] as const

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const RABBITMQ_PROTOCOLS = ['amqp:', 'amqps:'] as const

const workerEnvironmentSchema = z
  .object({
    APP_ENV: z.string().trim().min(1).default('local'),
    // infRespTec: as quatro juntas ou nenhuma — grupo incompleto é rejeição na SEFAZ.
    CTE_TECHNICAL_RESPONSIBLE_CNPJ: z.string().trim().min(1).optional(),
    CTE_TECHNICAL_RESPONSIBLE_CONTACT: z.string().trim().min(1).optional(),
    CTE_TECHNICAL_RESPONSIBLE_EMAIL: z.string().trim().email().optional(),
    CTE_TECHNICAL_RESPONSIBLE_PHONE: z.string().trim().min(1).optional(),
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
    SENTRY_DSN: optionalDsn(),
    SENTRY_ENVIRONMENT: z.string().trim().min(1).optional(),
    WORKER_PORT: z.coerce.number().int().min(0).max(65_535).default(53_002),
    WORKER_PREFETCH: z.coerce.number().int().min(1).max(100).default(1),
  })
  .superRefine((environment, context) => {
    const declared = TECHNICAL_RESPONSIBLE_KEYS.filter(
      (key) => environment[key] !== undefined,
    ).length
    if (declared > 0 && declared < TECHNICAL_RESPONSIBLE_KEYS.length) {
      context.addIssue({
        code: 'custom',
        message: 'The technical responsible requires every field or none',
        path: [...TECHNICAL_RESPONSIBLE_KEYS],
      })
    }

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

  const technicalResponsible = toTechnicalResponsible(result.data)

  return {
    appEnv: result.data.APP_ENV,
    ...(technicalResponsible === undefined
      ? {}
      : { cteTechnicalResponsible: technicalResponsible }),
    databaseUrl: result.data.DATABASE_URL,
    foundationSyntheticConsumerEnabled: result.data.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED,
    foundationSyntheticEffectDelayMs: result.data.FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS,
    logLevel: result.data.LOG_LEVEL,
    port: result.data.WORKER_PORT,
    prefetch: result.data.WORKER_PREFETCH,
    queuePrefix: result.data.QUEUE_PREFIX,
    rabbitMqUrl: result.data.RABBITMQ_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/** Vazio é o padrão e significa desligado; preenchido e torto falha o boot. */
function optionalDsn(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || URL.canParse(value), {
      message: 'Invalid Sentry DSN',
    })
    .optional()
}

function toTechnicalResponsible(
  data: Readonly<{
    [TKey in (typeof TECHNICAL_RESPONSIBLE_KEYS)[number]]?: string | undefined
  }>,
): CteTechnicalResponsibleEnvironment | undefined {
  const cnpj = data.CTE_TECHNICAL_RESPONSIBLE_CNPJ
  const xContato = data.CTE_TECHNICAL_RESPONSIBLE_CONTACT
  const email = data.CTE_TECHNICAL_RESPONSIBLE_EMAIL
  const fone = data.CTE_TECHNICAL_RESPONSIBLE_PHONE
  if (cnpj === undefined || xContato === undefined || email === undefined || fone === undefined) {
    return undefined
  }
  return { cnpj, email, fone, xContato }
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
