/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { isSupportedScheduleExpression } from '../companies/domain/scheduled-distribution-window.policy'
import type { ApiEnvironment } from '../shared/api.types'
import { parseCryptographicConfiguration } from './cryptographic-configuration.schema'
import { DEFAULT_SCHEDULED_DISTRIBUTION_CRON } from './scheduled-distribution.constant'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Vazio é o padrão e significa desligado; preenchido e torto derruba o boot. */
function optionalUrl(name: string): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || URL.canParse(value), {
      message: `${name} must be a valid URL`,
    })
    .optional()
}

/** Declarada e vazia é ausência: o `.env.example` escreve o padrão desligado sem derrubar o boot. */
function optionalText(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
}

const environmentSchema = z.object({
  APP_ENV: z.string().trim().min(1).default('local'),
  APP_PORT: z.coerce.number().int().min(0).max(65_535).default(53_001),
  // Não declarar é a forma de manter a rota de arranque morta; declarar em branco é engano de
  // configuração e derruba o boot. Nunca `.trim()`: espaço faz parte do segredo comparado.
  BOOTSTRAP_TOKEN: z
    .string()
    .refine((value) => value.trim() !== '', { message: 'BOOTSTRAP_TOKEN must not be blank' })
    .optional(),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        POSTGRESQL_PROTOCOLS.includes(
          new URL(value).protocol as (typeof POSTGRESQL_PROTOCOLS)[number],
        ),
      {
        message: 'DATABASE_URL must use PostgreSQL',
      },
    ),
  FRONTEND_ORIGIN: z.string().refine(isTrustedFrontendOrigin, {
    message: 'FRONTEND_ORIGIN must be a canonical HTTPS origin or HTTP localhost origin',
  }),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().trim().min(1),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().trim().min(1),
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  KEYCLOAK_ISSUER: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_ISSUER must be an HTTPS URL or an HTTP localhost URL',
  }),
  KEYCLOAK_JWKS_URI: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_JWKS_URI must be an HTTPS URL or an HTTP localhost URL',
  }),
  // Ausente mantém a rota de arranque morta (ADR-0022) — a empresa do ambiente é opcional aqui.
  PROVISION_COMPANY_ID: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || UUID_PATTERN.test(value), {
      message: 'PROVISION_COMPANY_ID must be a valid UUID',
    })
    .optional(),
  FLEET_VEHICLE_LOOKUP_TOKEN: z.string().trim().default(''),
  FLEET_VEHICLE_LOOKUP_URL: z
    .string()
    .trim()
    // Variável declarada e vazia significa provedor não contratado — não pode derrubar o boot.
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'FLEET_VEHICLE_LOOKUP_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Endereço público desta instalação, por onde a prefeitura devolve o postback de NFS-e. Vazio
  // significa callback não publicado, e aí a rota anônima nem é registrada. Não é segredo — o
  // segredo é o token opaco por empresa, que vive no banco e nunca sai em variável de ambiente.
  NFSE_CALLBACK_BASE_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'NFSE_CALLBACK_BASE_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // Cadência do serviço de cron, para a tela dizer quando é o próximo ciclo. Expressão que a
  // política não sabe resolver derruba o boot: melhor não subir do que servir data inventada.
  SCHEDULED_DISTRIBUTION_CRON: z
    .string()
    .trim()
    .default(DEFAULT_SCHEDULED_DISTRIBUTION_CRON)
    .refine(isSupportedScheduleExpression, {
      message: 'SCHEDULED_DISTRIBUTION_CRON must pin only the minute field',
    }),
  LOG_SINK_URL: optionalUrl('LOG_SINK_URL'),
  SENTRY_DSN: optionalUrl('SENTRY_DSN'),
  SENTRY_ENVIRONMENT: optionalText(),
})

export function parseEnvironment(environment: Record<string, string | undefined>): ApiEnvironment {
  const parsed = environmentSchema.parse(environment)
  const cryptography = parseCryptographicConfiguration(environment)

  return {
    appEnv: parsed.APP_ENV,
    bootstrapToken: parsed.BOOTSTRAP_TOKEN,
    companyId: parsed.PROVISION_COMPANY_ID,
    cryptography,
    databaseUrl: parsed.DATABASE_URL,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    keycloak: {
      admin: {
        clientId: parsed.KEYCLOAK_ADMIN_CLIENT_ID,
        clientSecret: parsed.KEYCLOAK_ADMIN_CLIENT_SECRET,
      },
      audience: parsed.KEYCLOAK_AUDIENCE,
      issuer: parsed.KEYCLOAK_ISSUER,
      jwksUri: parsed.KEYCLOAK_JWKS_URI,
    },
    logLevel: parsed.LOG_LEVEL,
    nfseCallbackBaseUrl: parsed.NFSE_CALLBACK_BASE_URL,
    port: parsed.APP_PORT,
    scheduledDistributionCron: parsed.SCHEDULED_DISTRIBUTION_CRON,
    logSinkUrl: parsed.LOG_SINK_URL,
    sentryDsn: parsed.SENTRY_DSN,
    sentryEnvironment: parsed.SENTRY_ENVIRONMENT ?? parsed.APP_ENV,
    vehicleLookup:
      parsed.FLEET_VEHICLE_LOOKUP_URL === undefined
        ? null
        : { token: parsed.FLEET_VEHICLE_LOOKUP_TOKEN, url: parsed.FLEET_VEHICLE_LOOKUP_URL },
  }
}

function isTrustedLookupUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value)
  )
}

function isTrustedFrontendOrigin(value: string): boolean {
  return (
    /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?$/.test(value)
  )
}

export function isTrustedIdentityUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value)
  )
}
