/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 250 T2.2: o código de tributação nacional aceita só seis dígitos, a alíquota do Simples não
 * aceita negativo, e as três colunas novas são nuláveis (linha antiga atravessa intacta). O rollback
 * recusa enquanto houver perfil com os campos ou tentativa com chave do provedor, e sem eles tira as
 * colunas e a linha do journal — a migration volta a aplicar.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { insertFreightRule, insertNfseProfile } from './cte-profile-output-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_nfse_national_taxation'
const CHECK_VIOLATION = '23514'
const NEW_COLUMNS = ['national_taxation_code', 'provider_request_key', 'simples_national_rate']

export type NfseNationalTaxationProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
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

async function countNewColumns(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select count(*)::int as count from information_schema.columns
    where table_schema = 'public' and column_name in ${database(NEW_COLUMNS)}
      and table_name in ('nfse_emission_profiles', 'nfse_issuance_attempts')
  `
  return row?.count ?? 0
}

async function insertAttempt(probe: NfseNationalTaxationProbe, invoiceId: string): Promise<void> {
  const { companyId, database } = probe
  const key = crypto.randomUUID()
  await database`
    insert into nfse_issuance_attempts (
      company_id, invoice_id, attempt_kind, attempt_number, status, idempotency_key,
      idempotency_fingerprint, request_fingerprint, fiscal_environment, correlation_id,
      provider_request_key
    ) values (
      ${companyId}, ${invoiceId}, 'issue', 1, 'pending', ${key}, ${key}, ${key}, 'homologation',
      'nfse-national-taxation-probe', ${key}
    )
  `
}

export async function assertNfseNationalTaxation(probe: NfseNationalTaxationProbe): Promise<void> {
  const { companyId, database, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('nfse_national_taxation migration is required')

  const ruleId = await insertFreightRule(database, companyId, userId)
  const profileId = await insertNfseProfile(database, { companyId, freightRuleId: ruleId, userId })
  const [legacy] = await database<{ code: string | null; rate: string | null }[]>`
    select national_taxation_code as code, simples_national_rate as rate
    from nfse_emission_profiles where id = ${profileId}
  `
  expect(legacy).toEqual({ code: null, rate: null })

  for (const code of ['16020', '1602011', '16020a', '']) {
    await expectQueryToFail(
      database`update nfse_emission_profiles set national_taxation_code = ${code} where id = ${profileId}`,
      CHECK_VIOLATION,
      'nfse_emission_profiles_national_taxation_code_check',
    )
  }
  await expectQueryToFail(
    database`update nfse_emission_profiles set simples_national_rate = -0.000001 where id = ${profileId}`,
    CHECK_VIOLATION,
    'nfse_emission_profiles_simples_national_rate_check',
  )
  await database`
    update nfse_emission_profiles
    set national_taxation_code = '160201', simples_national_rate = 2.000000 where id = ${profileId}
  `

  const invoiceId = crypto.randomUUID()
  await database`
    insert into nfse_service_invoices (
      id, company_id, emission_profile_id, taker_tax_id, taker_legal_name, service_amount,
      description, calculation_snapshot, created_by_user_id
    ) values (
      ${invoiceId}, ${companyId}, ${profileId}, '98765432000188', 'Tomador', 100, 'Servico', '{}'::jsonb,
      ${userId}
    )
  `
  await insertAttempt(probe, invoiceId)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain('Refusing to roll back')
  expect(await countNewColumns(database)).toBe(NEW_COLUMNS.length)

  await database`update nfse_emission_profiles set national_taxation_code = null, simples_national_rate = null where id = ${profileId}`
  expect((await runRollback(database, rollback))?.message).toContain('1 attempt(s)')
  await database`update nfse_issuance_attempts set provider_request_key = null where invoice_id = ${invoiceId}`

  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await countNewColumns(database)).toBe(0)

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await countNewColumns(database)).toBe(NEW_COLUMNS.length)

  await database`delete from nfse_issuance_attempts where invoice_id = ${invoiceId}`
  await database`delete from nfse_service_invoices where id = ${invoiceId}`
  await database`delete from nfse_emission_profiles where id = ${profileId}`
  await database`delete from freight_rules where id = ${ruleId}`
}
