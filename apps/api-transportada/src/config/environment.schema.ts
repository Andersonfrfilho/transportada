/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { ApiEnvironment } from '../shared/api.types'
import { parseCryptographicConfiguration } from './cryptographic-configuration.schema'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const

const environmentSchema = z.object({
  APP_ENV: z.string().trim().min(1).default('local'),
  APP_PORT: z.coerce.number().int().min(0).max(65_535).default(53_001),
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
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  KEYCLOAK_ISSUER: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_ISSUER must be an HTTPS URL or an HTTP localhost URL',
  }),
  KEYCLOAK_JWKS_URI: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_JWKS_URI must be an HTTPS URL or an HTTP localhost URL',
  }),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export function parseEnvironment(environment: Record<string, string | undefined>): ApiEnvironment {
  const parsed = environmentSchema.parse(environment)
  const cryptography = parseCryptographicConfiguration(environment)

  return {
    appEnv: parsed.APP_ENV,
    cryptography,
    databaseUrl: parsed.DATABASE_URL,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    keycloak: {
      audience: parsed.KEYCLOAK_AUDIENCE,
      issuer: parsed.KEYCLOAK_ISSUER,
      jwksUri: parsed.KEYCLOAK_JWKS_URI,
    },
    logLevel: parsed.LOG_LEVEL,
    port: parsed.APP_PORT,
  }
}

function isTrustedFrontendOrigin(value: string): boolean {
  return (
    /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?$/.test(value)
  )
}

function isTrustedIdentityUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value)
  )
}
