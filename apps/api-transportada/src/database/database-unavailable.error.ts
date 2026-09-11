/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DatabaseUnavailableReason } from './database-pool.constant'

const MAX_CAUSE_DEPTH = 8

/** O banco não entregou conexão ou consulta no prazo — vira 503, nunca socket fechado mudo. */
export class DatabaseUnavailableError extends Error {
  public readonly reason: DatabaseUnavailableReason

  public constructor(reason: DatabaseUnavailableReason, options?: { readonly cause?: unknown }) {
    super(`Database unavailable: ${reason}`, options)
    this.name = 'DatabaseUnavailableError'
    this.reason = reason
  }
}

/** O cliente foi embora e a consulta foi cancelada com ele; a conexão volta ao pool. */
export class DatabaseQueryAbortedError extends Error {
  public constructor() {
    super('Database query aborted with the request')
    this.name = 'DatabaseQueryAbortedError'
  }
}

export type DatabaseFailure = DatabaseUnavailableError | DatabaseQueryAbortedError

/**
 * O drizzle embrulha o erro do driver em `DrizzleQueryError` com `cause`, e caso de uso pode
 * embrulhar de novo: a falha de banco é procurada pela cadeia, nunca só no topo.
 */
export function findDatabaseFailure(error: unknown): DatabaseFailure | undefined {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    if (current instanceof DatabaseUnavailableError) return current
    if (current instanceof DatabaseQueryAbortedError) return current
    current = current instanceof Error ? current.cause : undefined
  }
  return undefined
}
