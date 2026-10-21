/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T2: a migration só alarga três CHECKs (`boleto_pdf` no tipo, `document_not_confirmed` no retorno e
 * no evento). O rollback recusa enquanto um tipo usa o boleto conferido (não reescreve dado) e, sem ele,
 * devolve a CHECK estreita; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { rollbackContractorReplyEventDocumentReasons } from './contractor-reply-event-document-reasons.assertion.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_boleto_check'
const CHECK_VIOLATION = '23514'
const ATTACHMENT_KIND_CHECK = 'company_occurrence_types_contractor_reply_attachment_kind_check'
const ROLLBACK_REFUSAL = 'existem tipos de ocorrência com anexo boleto_pdf'

export type ContractorReplyBoletoCheckProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

function insertBoletoType(probe: ContractorReplyBoletoCheckProbe, id: string) {
  return probe.database`
    insert into company_occurrence_types
      (id, company_id, name, stage, items_mode, redelivery_policy, emails_contractor,
       contractor_reply_mode, contractor_reply_attachment_kind, driver_reply_template,
       forward_email_subject, forward_email_body)
    values (${id}, ${probe.companyId}, ${`Prova 276 ${id}`}, 'delivery', 'off', 'unset', true,
       'forward_after_approval', 'boleto_pdf', 'Segue o boleto', 'Boleto', 'Segue o boleto')
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

export async function assertContractorReplyBoletoCheck(
  probe: ContractorReplyBoletoCheckProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('contractor_reply_boleto_check is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const typeId = crypto.randomUUID()
  await insertBoletoType(probe, typeId)
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await readMigrationNames(database)).toContain(directory)

  await database`delete from company_occurrence_types where id = ${typeId}`
  /** Spec 278: a migration mais nova alarga a mesma CHECK do evento; sai antes, e o reapply a devolve. */
  await rollbackContractorReplyEventDocumentReasons(database, directories)
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readMigrationNames(database)).not.toContain(directory)
  await expectQueryToFail(insertBoletoType(probe, typeId), CHECK_VIOLATION, ATTACHMENT_KIND_CHECK)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  await insertBoletoType(probe, typeId)
  await database`delete from company_occurrence_types where id = ${typeId}`
}
