/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão de segurança da Fase 4a, S1/S2): a prévia que falhou aceita os três códigos
 * novos; sem a migration eles são recusados; o rollback recusa (sem apagar) enquanto houver prévia
 * com um deles, e sem elas devolve o CHECK anterior, sai do journal e a migration volta. Começa pelo
 * rollback porque a asserção da migration anterior a reaplica e reescreve o CHECK sem estes códigos.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_cargo_preview_security_failure_codes'
const CONSTRAINT = 'cargo_previews_error_code_check'
const CHECK_VIOLATION = '23514'
const NEW_CODES = [
  'PREVIEW_MATCH_TIMEOUT',
  'PREVIEW_PROCESSING_INTERRUPTED',
  'PREVIEW_TOO_MANY_CELLS',
] as const

export type CargoPreviewSecurityFailureCodesProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

type Scope = CargoPreviewSecurityFailureCodesProbe & { readonly contractorId: string }

function insertFailedPreview(scope: Scope & { readonly code: string }) {
  const id = crypto.randomUUID()
  const sha = id.replaceAll('-', '').padEnd(64, '0')
  return scope.database`
    insert into cargo_previews (id, company_id, contractor_id, source, status, error_code,
      received_at, file_name, file_sha256, file_object_id, file_size_bytes, uploaded_by_user_id,
      idempotency_key, request_fingerprint)
    values (${id}, ${scope.companyId}, ${scope.contractorId}, 'upload', 'failed', ${scope.code},
      now(), 'FR.xlsm', ${sha}, ${crypto.randomUUID()}, 10, ${scope.userId},
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

async function expectCodesRefused(scope: Scope): Promise<void> {
  for (const code of NEW_CODES) {
    await expectQueryToFail(insertFailedPreview({ ...scope, code }), CHECK_VIOLATION, CONSTRAINT)
  }
}

export async function assertCargoPreviewSecurityFailureCodes(
  probe: CargoPreviewSecurityFailureCodesProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('cargo_preview_security_failure_codes is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  const contractorId = crypto.randomUUID()
  await database`
    insert into contractors (id, company_id, tax_id)
    values (${contractorId}, ${probe.companyId}, '30290856000160')
  `
  const scope = { ...probe, contractorId }

  expect(await runRollback(database, rollback)).toBeUndefined()
  await expectCodesRefused(scope)
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  for (const code of NEW_CODES) await insertFailedPreview({ ...scope, code })
  await expectQueryToFail(
    insertFailedPreview({ ...scope, code: 'PREVIEW_INVENTED' }),
    CHECK_VIOLATION,
    CONSTRAINT,
  )

  expect((await runRollback(database, rollback))?.message).toContain(CONSTRAINT)
  await database`delete from cargo_previews where contractor_id = ${contractorId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  await expectCodesRefused(scope)
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  await insertFailedPreview({ ...scope, code: 'PREVIEW_TOO_MANY_CELLS' })
  await database`delete from cargo_previews where contractor_id = ${contractorId}`
  await database`delete from contractors where id = ${contractorId}`
}
