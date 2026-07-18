import { z } from 'zod'

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

export const environmentSchema = z.object({
  APP_NAME: z.string().min(1).default('TransportAdA'),
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  APP_PORT: z.coerce.number().int().min(1).max(65_535).default(53_001),
  WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(53_002),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  REDIS_URL: z.url().startsWith('redis://'),
  QUEUE_PREFIX: z.string().min(1).default('transportada_local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FISCAL_DEFAULT_ENVIRONMENT: z.enum(['homologation', 'production']).default('homologation'),
  FISCAL_REAL_ISSUANCE_ENABLED: booleanFromString,
})

export type AppEnvironment = z.infer<typeof environmentSchema>

export class EnvironmentValidationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join('; ')}`)
    this.name = 'EnvironmentValidationError'
  }
}

export function parseEnvironment(input: NodeJS.ProcessEnv): AppEnvironment {
  const result = environmentSchema.safeParse(input)

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  if (result.data.APP_ENV === 'production' && !result.data.QUEUE_PREFIX.includes('production')) {
    throw new EnvironmentValidationError([
      'QUEUE_PREFIX must contain "production" when APP_ENV=production',
    ])
  }

  if (
    result.data.APP_ENV !== 'production' &&
    result.data.FISCAL_DEFAULT_ENVIRONMENT === 'production'
  ) {
    throw new EnvironmentValidationError([
      'FISCAL_DEFAULT_ENVIRONMENT=production is only allowed when APP_ENV=production',
    ])
  }

  return result.data
}
