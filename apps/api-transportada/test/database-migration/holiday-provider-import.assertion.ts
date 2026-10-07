/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): aplica, confere os NOMES (todos explícitos, todos de até 63 bytes),
 * restringe, faz rollback e reaplica. A rotina nasce pausada de fábrica (D13).
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import {
  assertProviderCacheConstraints,
  clearProviderCache,
} from './holiday-provider-import-cache.assertion.js'
import { assertCompanyTables } from './holiday-provider-import-company.assertion.js'
import { assertPublishedTables } from './holiday-provider-import-published.assertion.js'
import {
  assertHolidayProviderImportRollback,
  type RollbackProbe,
} from './holiday-provider-import-rollback.assertion.js'
import {
  APPLIED_STATE,
  readImportState,
  ROLLED_BACK_STATE,
} from './holiday-provider-import-state.assertion.js'
import {
  ALL_NEW_CONSTRAINT_NAMES,
  ALL_NEW_INDEX_NAMES,
  MIGRATION_SUFFIX,
  POSTGRES_IDENTIFIER_MAX_BYTES,
} from './holiday-provider-import.constant.js'

export type HolidayProviderImportProbe = RollbackProbe

async function withOtherCompany(
  database: SQL,
  callback: (otherCompanyId: string) => Promise<void>,
): Promise<void> {
  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  try {
    await callback(otherCompanyId)
  } finally {
    await database`delete from companies where id = ${otherCompanyId}`
  }
}

export async function assertHolidayProviderImport(
  probe: HolidayProviderImportProbe,
): Promise<void> {
  const { companyId, database, directories } = probe
  if (!directories.some((name) => name.endsWith(MIGRATION_SUFFIX))) {
    throw new Error('holiday_provider_import migration is required')
  }

  for (const name of [...ALL_NEW_CONSTRAINT_NAMES, ...ALL_NEW_INDEX_NAMES]) {
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
  }
  expect(await readImportState(database)).toEqual(APPLIED_STATE)

  await assertProviderCacheConstraints(database)
  await clearProviderCache(database)
  await withOtherCompany(database, (otherCompanyId) =>
    assertCompanyTables({ companyId, database, otherCompanyId }),
  )
  await assertPublishedTables(database, companyId)

  await assertHolidayProviderImportRollback(probe, APPLIED_STATE, ROLLED_BACK_STATE)
}
