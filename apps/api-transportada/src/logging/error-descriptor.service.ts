/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { findPostgresError } from '../database/postgres-error.support'
import { isDiagnosableError } from '../shared/diagnosable.error'

const UNKNOWN_ERROR_NAME = 'UnknownError'

export type ErrorDescriptor = {
  readonly constraint?: string
  readonly errorName: string
  readonly message?: string
  readonly sqlState?: string
}

/**
 * Descreve a forma do erro para o log: nunca o stack, nunca parâmetro de query, e nunca a
 * mensagem do **driver** -- ela traz `detail: "Failing row contains (…)"`, com o conteúdo da
 * linha, que é PII em log (`security.md` §1). De erro do Postgres saem só constraint e SQLSTATE.
 *
 * A mensagem **que nós escrevemos** sai: ela é do código, não do dado, e é o que torna um defeito
 * diagnosticável sem ler fonte (spec 074).
 */
export function describeErrorForLog(error: unknown): ErrorDescriptor {
  const details = findPostgresError({ error })
  const message = details === null || details === undefined ? readErrorMessage(error) : undefined
  return {
    ...(details?.constraint === undefined ? {} : { constraint: details.constraint }),
    errorName: readErrorName(error),
    ...(message === undefined ? {} : { message }),
    ...(details?.sqlState === undefined ? {} : { sqlState: details.sqlState }),
  }
}

function readErrorName(error: unknown): string {
  if (error instanceof Error && error.name.length > 0) return error.name
  if (typeof error === 'object' && error !== null) {
    const name = (error as { readonly name?: unknown }).name
    if (typeof name === 'string' && name.length > 0) return name
  }
  return UNKNOWN_ERROR_NAME
}

/**
 * Permissao **nominal**: so `DiagnosableError`. Mensagem de erro arbitrario pode carregar segredo
 * (senha de PFX, corpo de nota) ou o `detail` do driver com a linha que falhou -- e a politica de
 * nao logar mensagem existe por isso, com contrato proprio guardando.
 */
function readErrorMessage(error: unknown): string | undefined {
  if (!isDiagnosableError(error)) return undefined
  const message = error.message.trim()
  return message.length === 0 ? undefined : message
}
