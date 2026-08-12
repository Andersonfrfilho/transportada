/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { NFSE_STATUS_PULL_JOB } from '../nfse-status-pull/domain/nfse-status-pull.constant.js'
import {
  CRON_DEFAULT_CADENCE_MINUTES,
  CRON_DEFAULT_PAGE_SIZE,
  CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS,
  CRON_FISCAL_ENVIRONMENTS,
  CRON_JOBS,
  CRON_MAX_CADENCE_MINUTES,
  CRON_MAX_PAGE_SIZE,
  CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS,
} from './cron.constant.js'
import type { CronEnvironment, CronNfseStatusPullEnvironment } from './cron.types.js'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const

const DEFAULT_STORAGE_PROVIDER = 's3'
const DEFAULT_STORAGE_REGION = 'us-east-1'

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
  ENCRYPTION_ACTIVE_KEY_ID: optionalText(),
  ENCRYPTION_KEYRING_JSON: optionalText(),
  NFSE_PROVIDER_BASE_URL_HOMOLOGATION: optionalUrl(),
  NFSE_PROVIDER_BASE_URL_PRODUCTION: optionalUrl(),
  NFSE_PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS)
    .default(CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS),
  STORAGE_ACCESS_KEY: optionalText(),
  STORAGE_BUCKET: optionalText(),
  STORAGE_ENDPOINT: optionalText(),
  STORAGE_PROVIDER: optionalText(),
  STORAGE_REGION: optionalText(),
  STORAGE_SECRET_KEY: optionalText(),
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
    nfseStatusPull:
      result.data.CRON_JOB === NFSE_STATUS_PULL_JOB
        ? resolveNfseStatusPullEnvironment(result.data)
        : undefined,
    pageSize: result.data.PAGE_SIZE,
    logSinkUrl: result.data.LOG_SINK_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/**
 * A reconciliação abre segredo selado e arquiva documento fiscal: sem chaveiro, sem bucket e sem
 * endereço da prefeitura o processo **não sobe**. Falhar no boot é preferível a rodar meio ciclo e
 * deixar nota autorizada sem XML guardado. O deploy do outro job nunca passa por aqui.
 */
function resolveNfseStatusPullEnvironment(
  data: z.output<typeof cronEnvironmentSchema>,
): CronNfseStatusPullEnvironment {
  const providerBaseUrls = {
    homologation: data.NFSE_PROVIDER_BASE_URL_HOMOLOGATION,
    production: data.NFSE_PROVIDER_BASE_URL_PRODUCTION,
  } as const

  /** Homologação e produção juntas ou nenhuma: meia configuração emite no ambiente errado. */
  if (
    (providerBaseUrls.homologation === undefined) !==
    (providerBaseUrls.production === undefined)
  ) {
    throw new CronConfigurationError()
  }
  if (providerBaseUrls[data.FISCAL_ENVIRONMENT] === undefined) throw new CronConfigurationError()

  return {
    encryptionActiveKeyId: requireConfigured(data.ENCRYPTION_ACTIVE_KEY_ID),
    encryptionKeyRingJson: requireConfigured(data.ENCRYPTION_KEYRING_JSON),
    providerBaseUrls,
    providerTimeoutMilliseconds: data.NFSE_PROVIDER_TIMEOUT_MS,
    storage: {
      accessKey: requireConfigured(data.STORAGE_ACCESS_KEY),
      bucket: requireConfigured(data.STORAGE_BUCKET),
      endpoint: requireConfigured(data.STORAGE_ENDPOINT),
      provider: data.STORAGE_PROVIDER ?? DEFAULT_STORAGE_PROVIDER,
      region: data.STORAGE_REGION ?? DEFAULT_STORAGE_REGION,
      secretKey: requireConfigured(data.STORAGE_SECRET_KEY),
    },
  }
}

/** O erro não carrega o nome nem o valor da variável: mensagem de boot vai para log. */
function requireConfigured(value: string | undefined): string {
  if (value === undefined) throw new CronConfigurationError()
  return value
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
