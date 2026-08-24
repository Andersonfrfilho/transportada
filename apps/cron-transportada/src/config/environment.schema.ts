/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  CRON_DEFAULT_CADENCE_MINUTES,
  CRON_DEFAULT_PAGE_SIZE,
  CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS,
  CRON_FISCAL_ENVIRONMENTS,
  CRON_MAX_CADENCE_MINUTES,
  CRON_MAX_PAGE_SIZE,
  CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS,
} from './cron.constant.js'
import type {
  CronEnvironment,
  CronFuelPricePullEnvironment,
  CronNotificationSchedulesEnvironment,
} from './cron.types.js'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const

const cronEnvironmentSchema = z.object({
  APP_ENV: z.string().trim().min(1).default('local'),
  CADENCE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRON_MAX_CADENCE_MINUTES)
    .default(CRON_DEFAULT_CADENCE_MINUTES),
  DATABASE_URL: protocolUrl(POSTGRESQL_PROTOCOLS),
  FISCAL_ENVIRONMENT: z.enum(CRON_FISCAL_ENVIRONMENTS),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PAGE_SIZE: z.coerce.number().int().min(1).max(CRON_MAX_PAGE_SIZE).default(CRON_DEFAULT_PAGE_SIZE),
  LOG_SINK_URL: optionalUrl(),
  SENTRY_DSN: optionalUrl(),
  SENTRY_ENVIRONMENT: optionalText(),
  ANEEL_BASE_URL: optionalUrl(),
  ANEEL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS)
    .default(CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS),
  ANP_BASE_URL: optionalUrl(),
  ANP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS)
    .default(CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS),
  NOTIFICATION_SUPPRESSION_HMAC_KEY: optionalText(),
  // A batida publica; cron que não alcança o broker não tem o que fazer, e falha no boot.
  QUEUE_PREFIX: z.string().trim().min(1),
  RABBITMQ_URL: z.string().trim().min(1),
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
    databaseUrl: result.data.DATABASE_URL,
    fiscalEnvironment: result.data.FISCAL_ENVIRONMENT,
    fuelPricePull: resolveFuelPricePullEnvironment(result.data),
    logLevel: result.data.LOG_LEVEL,
    notificationSchedules: resolveNotificationEnvironment(result.data),
    pageSize: result.data.PAGE_SIZE,
    queuePrefix: result.data.QUEUE_PREFIX,
    rabbitMqUrl: result.data.RABBITMQ_URL,
    logSinkUrl: result.data.LOG_SINK_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/**
 * A coleta não tem o que fazer sem os endereços das duas agências, e não existe padrão razoável
 * para nenhum deles: o domínio muda sem avisar, e chutar um faria o ciclo falhar toda semana em
 * silêncio. Variável opcional aqui seria pior: a metade esquecida viraria tela sem preço, sem nada
 * quebrar no boot. Preço e tarifa são dado público — não há segredo, só endereço e espera.
 *
 * Sem `CRON_JOB` quem decide se o bloco existe é a **presença** de uma das duas agências: nenhuma
 * declarada é rotina não configurada, e uma só derruba o boot, que é o mesmo tudo-ou-nada de antes.
 */
function resolveFuelPricePullEnvironment(
  data: z.output<typeof cronEnvironmentSchema>,
): CronFuelPricePullEnvironment | undefined {
  const declared = [data.ANEEL_BASE_URL, data.ANP_BASE_URL].filter((value) => value !== undefined)
  if (declared.length === 0) return undefined

  return {
    aneelBaseUrl: requireConfigured(data.ANEEL_BASE_URL),
    aneelTimeoutMilliseconds: data.ANEEL_TIMEOUT_MS,
    anpBaseUrl: requireConfigured(data.ANP_BASE_URL),
    anpTimeoutMilliseconds: data.ANP_TIMEOUT_MS,
  }
}

const BASE64_32_BYTES_PATTERN = /^[A-Za-z0-9+/]{43}=$/

/**
 * Este job enfileira no mesmo trilho da API e consulta supressão com a mesma chave que ela usou
 * para gravar. Chave diferente produz HMAC que não casa com nada — e o e-mail volta a sair para
 * quem já recusou. Falhar no boot é preferível a descobrir isso na primeira entrega. Broker e
 * prefixo já são exigidos pela batida; o que resta gatilhar por presença é a chave.
 */
function resolveNotificationEnvironment(
  data: z.output<typeof cronEnvironmentSchema>,
): CronNotificationSchedulesEnvironment | undefined {
  const suppressionHmacKey = data.NOTIFICATION_SUPPRESSION_HMAC_KEY
  if (suppressionHmacKey === undefined) return undefined
  if (!BASE64_32_BYTES_PATTERN.test(suppressionHmacKey)) throw new CronConfigurationError()

  return {
    queuePrefix: data.QUEUE_PREFIX,
    rabbitMqUrl: data.RABBITMQ_URL,
    suppressionHmacKey,
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
