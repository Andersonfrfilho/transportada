/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  CRON_DEFAULT_CADENCE_MINUTES,
  CRON_DEFAULT_PAGE_SIZE,
  CRON_FISCAL_ENVIRONMENTS,
  CRON_JOBS,
  CRON_MAX_CADENCE_MINUTES,
  CRON_MAX_PAGE_SIZE,
} from './cron.constant.js'
import type { CronEnvironment } from './cron.types.js'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const

const cronEnvironmentSchema = z.object({
  APP_ENV: z.string().trim().min(1).default('local'),
  CADENCE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRON_MAX_CADENCE_MINUTES)
    .default(CRON_DEFAULT_CADENCE_MINUTES),
  CRON_JOB: z.enum(CRON_JOBS),
  DATABASE_URL: protocolUrl(POSTGRESQL_PROTOCOLS),
  FISCAL_ENVIRONMENT: z.enum(CRON_FISCAL_ENVIRONMENTS),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PAGE_SIZE: z.coerce.number().int().min(1).max(CRON_MAX_PAGE_SIZE).default(CRON_DEFAULT_PAGE_SIZE),
  LOG_SINK_URL: optionalUrl(),
  SENTRY_DSN: optionalUrl(),
  SENTRY_ENVIRONMENT: optionalText(),
})

export class CronConfigurationError extends Error {
  override readonly name = 'CronConfigurationError'

  constructor() {
    super('Invalid cron environment configuration')
  }
}

export function parseCronEnvironment(
  environment: Record<string, string | undefined>,
): CronEnvironment {
  const result = cronEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    throw new CronConfigurationError()
  }

  return {
    appEnv: result.data.APP_ENV,
    cadenceMinutes: result.data.CADENCE_MINUTES,
    cronJob: result.data.CRON_JOB,
    databaseUrl: result.data.DATABASE_URL,
    fiscalEnvironment: result.data.FISCAL_ENVIRONMENT,
    logLevel: result.data.LOG_LEVEL,
    pageSize: result.data.PAGE_SIZE,
    logSinkUrl: result.data.LOG_SINK_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/** Vazio é o padrão e significa desligado; preenchido e torto falha o boot. */
function optionalUrl(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || URL.canParse(value), {
      message: 'Invalid URL',
    })
    .optional()
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

/** Declarada e vazia é ausência: o `.env.example` escreve o padrão desligado sem derrubar o boot. */
function optionalText(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
}
