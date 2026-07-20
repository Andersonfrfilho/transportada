/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'

import {
  CompanyFiscalProfileConflictError,
  CompanySettingsVersionConflictError,
  FiscalSequenceLockedError,
} from '../domain/company-settings.error.js'
import type { CompanySettingsTransaction } from './drizzle-company-settings.types.js'

type PostgresErrorDetails = {
  readonly code: string | undefined
  readonly constraint: string | undefined
}

export async function acquireCompanySettingsLock(
  transaction: CompanySettingsTransaction,
  companyId: string,
): Promise<void> {
  await acquireAdvisoryLock(transaction, ['company-settings', companyId])
}

export async function acquireIdempotencyLock(
  transaction: CompanySettingsTransaction,
  fields: readonly string[],
): Promise<void> {
  await acquireAdvisoryLock(transaction, ['idempotency', ...fields])
}

export function mapCompanySettingsPersistenceError(error: unknown): unknown {
  if (isCompanySettingsConflict(error)) return error
  const postgresError = findPostgresError(error)
  if (postgresError?.constraint === 'company_fiscal_profiles_cnpj_unique') {
    return new CompanyFiscalProfileConflictError()
  }
  if (
    postgresError?.constraint === 'company_fiscal_profiles_pkey' ||
    postgresError?.constraint === 'fiscal_sequences_company_id_environment_model_series_unique'
  ) {
    return new CompanySettingsVersionConflictError()
  }
  return error
}

async function acquireAdvisoryLock(
  transaction: CompanySettingsTransaction,
  fields: readonly string[],
): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

function isCompanySettingsConflict(error: unknown): boolean {
  return (
    error instanceof CompanyFiscalProfileConflictError ||
    error instanceof CompanySettingsVersionConflictError ||
    error instanceof FiscalSequenceLockedError
  )
}

function findPostgresError(error: unknown, depth = 0): PostgresErrorDetails | null {
  if (depth > 3 || typeof error !== 'object' || error === null) return null
  const candidate = error as {
    readonly cause?: unknown
    readonly code?: unknown
    readonly constraint?: unknown
  }
  if (typeof candidate.constraint === 'string') {
    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      constraint: candidate.constraint,
    }
  }
  const causedBy = findPostgresError(candidate.cause, depth + 1)
  if (causedBy !== null) return causedBy
  return typeof candidate.code === 'string' ? { code: candidate.code, constraint: undefined } : null
}
