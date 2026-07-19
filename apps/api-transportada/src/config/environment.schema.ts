/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { ApiEnvironment } from '../shared/api.types'

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
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_JWKS_URI: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export function parseEnvironment(environment: Record<string, string | undefined>): ApiEnvironment {
  const parsed = environmentSchema.parse(environment)

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
    keycloak: {
      audience: parsed.KEYCLOAK_AUDIENCE,
      issuer: parsed.KEYCLOAK_ISSUER,
      jwksUri: parsed.KEYCLOAK_JWKS_URI,
    },
    logLevel: parsed.LOG_LEVEL,
    port: parsed.APP_PORT,
  }
}
