/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { findPostgresError } from '../database/postgres-error.support'

const UNKNOWN_ERROR_NAME = 'UnknownError'

export type ErrorDescriptor = {
  readonly constraint?: string
  readonly errorName: string
  readonly sqlState?: string
}

/** Descreve a forma do erro para o log: nunca a mensagem, o stack ou parâmetro de query. */
export function describeErrorForLog(error: unknown): ErrorDescriptor {
  const details = findPostgresError({ error })
  return {
    ...(details?.constraint === undefined ? {} : { constraint: details.constraint }),
    errorName: readErrorName(error),
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
