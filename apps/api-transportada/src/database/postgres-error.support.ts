/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const MAX_CAUSE_DEPTH = 3

export const POSTGRES_UNIQUE_VIOLATION = '23505'

export type PostgresErrorDetails = {
  readonly constraint: string | undefined
  readonly sqlState: string | undefined
}

export function findPostgresError(input: {
  readonly depth?: number
  readonly error: unknown
}): PostgresErrorDetails | null {
  const depth = input.depth ?? 0
  if (depth > MAX_CAUSE_DEPTH || typeof input.error !== 'object' || input.error === null)
    return null
  const candidate = input.error as {
    readonly cause?: unknown
    readonly code?: unknown
    readonly constraint?: unknown
    readonly errno?: unknown
  }
  const sqlState =
    typeof candidate.errno === 'string'
      ? candidate.errno
      : typeof candidate.code === 'string'
        ? candidate.code
        : undefined
  if (typeof candidate.constraint === 'string') {
    return { constraint: candidate.constraint, sqlState }
  }
  const causedBy = findPostgresError({ depth: depth + 1, error: candidate.cause })
  return causedBy ?? (sqlState === undefined ? null : { constraint: undefined, sqlState })
}

export function violatedUniqueConstraint(error: unknown): string | undefined {
  const details = findPostgresError({ error })
  if (details === null || details.sqlState !== POSTGRES_UNIQUE_VIOLATION) return undefined
  return details.constraint
}
