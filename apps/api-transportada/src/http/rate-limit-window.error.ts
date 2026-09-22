/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DiagnosableError } from '../shared/diagnosable.error.js'

/**
 * Guarda defensiva: o `upsert` de `rate_limit_windows` sempre tem `RETURNING`, então nunca deveria
 * devolver zero linhas — mas um `new Error` cru aqui perderia o motivo no log
 * (`api-transportada/CLAUDE.md`, "O banco falha rápido, e diz por quê").
 */
export class RateLimitWindowUpsertMissingRowError extends DiagnosableError {
  public override readonly name = 'RateLimitWindowUpsertMissingRowError'

  public constructor() {
    super('Rate limit window upsert returned no row')
  }
}
