/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (correção da revisão da Fase 4a, H2/M1): a prévia que falhou aceita os dois códigos novos
 * e ainda recusa código inventado; o rollback recusa (sem apagar) enquanto houver prévia com um
 * deles, e sem elas devolve o CHECK antigo, sai do journal e a migration volta.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_cargo_preview_failure_codes'
const CONSTRAINT = 'cargo_previews_error_code_check'
const CHECK_VIOLATION = '23514'

export type CargoPreviewFailureCodesProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

function insertFailedPreview(
  probe: CargoPreviewFailureCodesProbe & { readonly contractorId: string; readonly code: string },
) {
  const id = crypto.randomUUID()
  const sha = id.replaceAll('-', '').padEnd(64, '0')
  return probe.database`
    insert into cargo_previews (id, company_id, contractor_id, source, status, error_code,
      received_at, file_name, file_sha256, file_object_id, file_size_bytes, uploaded_by_user_id,
      idempotency_key, request_fingerprint)
    values (${id}, ${probe.companyId}, ${probe.contractorId}, 'upload', 'failed', ${probe.code},
      now(), 'FR.xlsm', ${sha}, ${crypto.randomUUID()}, 10, ${probe.userId},
      ${`migration-key-${id}`}, ${sha})
  `
}

async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

export async function assertCargoPreviewFailureCodes(
  probe: CargoPreviewFailureCodesProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('cargo_preview_failure_codes is required')
  const contractorId = crypto.randomUUID()
  await database`
    insert into contractors (id, company_id, tax_id)
    values (${contractorId}, ${probe.companyId}, '30290856000160')
  `
  const scope = { ...probe, contractorId }
  await insertFailedPreview({ ...scope, code: 'PREVIEW_VALUE_OUT_OF_RANGE' })
  await insertFailedPreview({ ...scope, code: 'PREVIEW_PROCESSING_ABANDONED' })
  await expectQueryToFail(
    insertFailedPreview({ ...scope, code: 'PREVIEW_INVENTED' }),
    CHECK_VIOLATION,
    CONSTRAINT,
  )

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain(CONSTRAINT)

  await database`delete from cargo_previews where contractor_id = ${contractorId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  await expectQueryToFail(
    insertFailedPreview({ ...scope, code: 'PREVIEW_PROCESSING_ABANDONED' }),
    CHECK_VIOLATION,
    CONSTRAINT,
  )
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  await insertFailedPreview({ ...scope, code: 'PREVIEW_PROCESSING_ABANDONED' })
  await database`delete from cargo_previews where contractor_id = ${contractorId}`
  await database`delete from contractors where id = ${contractorId}`
}
