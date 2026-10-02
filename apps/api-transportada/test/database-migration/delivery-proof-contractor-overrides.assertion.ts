/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-C2: a migration nova cria uma FK de verdade em `delivery_proof_setting_overrides`
 * (`company_id, tax_id) -> delivery_clients`) e precisa fazer backfill antes — todo override
 * "órfão" (configurado para um CNPJ que a empresa nunca viu numa nota) ganha uma linha nova em
 * `delivery_clients`, para a constraint nunca apagar uma exceção já configurada.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_delivery_proof_contractor_overrides'
/** CNPJ alfanumérico válido pelo `TAX_ID_CHECK_PATTERN` (12 alfanuméricos + 2 dígitos). */
const ORPHAN_TAX_ID = 'ZZ999888000155'
const FOREIGN_KEY_VIOLATION = '23503'
// ON DELETE RESTRICT: o Postgres 18 responde 23001 (restrict_violation); versões anteriores, 23503.
const RESTRICT_VIOLATION = '23001'
const RESTRICT_VIOLATION_SQL_STATES = [RESTRICT_VIOLATION, FOREIGN_KEY_VIOLATION] as const

export type DeliveryProofContractorOverridesBackfillProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function readRollback(directory: string): Promise<string> {
  const { join } = await import('node:path')
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

/**
 * Roda a migration contra um banco com um override "órfão" (fixture criada aqui, de propósito, com
 * a FK ainda desfeita) e confere que `delivery_clients` ganha a linha, a exceção sobrevive e a FK
 * passa a valer (restrict) sem precisar de nenhuma intervenção manual.
 */
export async function assertDeliveryProofContractorOverridesBackfill(
  probe: DeliveryProofContractorOverridesBackfillProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('Delivery proof contractor overrides migration is required')
  }
  const rollback = await readRollback(directory)

  // Desfaz só esta migration: a FK nova some, e o override pode existir sem `delivery_clients`.
  await database.unsafe(rollback)

  await database`
    delete from delivery_proof_setting_overrides where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}
  `
  await database`delete from delivery_clients where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}`
  await database`
    insert into delivery_proof_setting_overrides (company_id, tax_id)
    values (${companyId}, ${ORPHAN_TAX_ID})
  `

  await runDatabaseMigrations({ connectionString })

  const [client] = (await database`
    select display_name, status from delivery_clients
    where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}
  `) as [{ display_name: string; status: string }]
  expect(client).toBeDefined()
  expect(client.display_name).toBe('')
  expect(client.status).toBe('active')

  const [override] = (await database`
    select tax_id from delivery_proof_setting_overrides
    where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}
  `) as [{ tax_id: string }]
  expect(override).toBeDefined()

  // A FK passou a valer: apagar o `delivery_clients` recém-criado, com a exceção ainda viva, recusa.
  await expectQueryToFail(
    database`delete from delivery_clients where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}`,
    RESTRICT_VIOLATION_SQL_STATES,
  )

  await database`
    delete from delivery_proof_setting_overrides where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}
  `
  await database`delete from delivery_clients where company_id = ${companyId} and tax_id = ${ORPHAN_TAX_ID}`
}
