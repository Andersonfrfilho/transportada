/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 250 T2.4 contra Postgres: a chave do provedor (`hash_pedido` da Nota RP v3) nasce igual ao
 * `attemptId` na emissão, é herdada de uma tentativa ambígua, e o `request_fingerprint` único por
 * tentativa continua distinguindo reemissões do mesmo pedido.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { DrizzleNfseInvoiceRepository } from '../../src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'
import { resolveInheritedProviderRequestKey } from '../../src/nfse-invoices/domain/nfse-provider-request-key.policy.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

let shared:
  | { readonly admin: SQL; readonly database: TestDatabase; readonly name: string }
  | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_250_t24_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  // Disposable database identifiers cannot be parameterized.
  await admin.unsafe(`create database "${name}"`)
  await runAllDatabaseMigrations({ connectionString: url.toString() })
  shared = {
    admin: new SQL(url.toString(), { max: 1 }),
    database: createDrizzleProvider({ connection: url.toString() }),
    name,
  }
  await admin.close({ timeout: 0 })
})

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await shared.admin.close({ timeout: 0 })
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

async function seedInvoice(raw: SQL): Promise<{ companyId: string; invoiceId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const ruleId = crypto.randomUUID()
  const profileId = crypto.randomUUID()
  const invoiceId = crypto.randomUUID()
  await raw`insert into identity_users (id, status) values (${userId}, 'active')`
  await raw`insert into companies (id, status) values (${companyId}, 'active')`
  await raw`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
  `
  await raw`
    insert into freight_rules (id, company_id, name, description, type, status, priority, current_version, created_by_user_id)
    values (${ruleId}, ${companyId}, 'Regra', '', 'percentage_of_invoice_total', 'active', 1, 1, ${userId})
  `
  await raw`
    insert into nfse_emission_profiles (
      id, company_id, name, status, freight_rule_id, taker, charge_component_label,
      municipality_ibge_code, municipality_name, cnae_code, service_list_item, description_template,
      created_by_user_id
    ) values (
      ${profileId}, ${companyId}, 'Perfil', 'active', ${ruleId}, '3', 'Frete', '3543402',
      'Ribeirão Preto', '4930202', '1602', 'Transporte', ${userId}
    )
  `
  await raw`
    insert into nfse_service_invoices (
      id, company_id, emission_profile_id, taker_tax_id, taker_legal_name, service_amount,
      description, calculation_snapshot, created_by_user_id
    ) values (
      ${invoiceId}, ${companyId}, ${profileId}, '98765432000188', 'Tomador', 100, 'Servico', '{}'::jsonb,
      ${userId}
    )
  `
  return { companyId, invoiceId }
}

function attemptInput(invoiceId: string, suffix: string, providerRequestKey?: string) {
  return {
    attemptKind: 'issue' as const,
    correlationId: `nfse-250-${suffix}`,
    fiscalEnvironment: 'homologation' as const,
    idempotencyKey: `nfse-250-key-${crypto.randomUUID()}`,
    invoiceId,
    // O mesmo pedido reemitido: a digital do pedido é igual, a única por tentativa não pode ser.
    requestFingerprint: 'f'.repeat(64),
    ...(providerRequestKey === undefined ? {} : { providerRequestKey }),
  }
}

describe('chave do provedor da tentativa de emissão (spec 250 T2.4)', () => {
  testWithPostgres(
    'a primeira tentativa grava o próprio attemptId como chave do provedor',
    async () => {
      const { admin, database } = shared!
      const { companyId, invoiceId } = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)

      const attempt = await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'first')),
      )

      const [row] = await admin<{ provider_request_key: string | null }[]>`
        select provider_request_key from nfse_issuance_attempts where id = ${attempt.attemptId}
      `
      expect(row?.provider_request_key).toBe(attempt.attemptId)
    },
    120_000,
  )

  testWithPostgres(
    'reemissão após falha ambígua copia a chave; após rejeição, a tentativa nova tem a própria',
    async () => {
      const { admin, database } = shared!
      const { companyId, invoiceId } = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)

      const first = await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'first')),
      )
      await admin`
        update nfse_issuance_attempts set status = 'failed', last_error_cause = 'timeout'
        where id = ${first.attemptId}
      `

      const history = await repository.transaction({ companyId }, (transaction) =>
        transaction.findLatestIssueAttempt({ invoiceId }),
      )
      expect(history).toEqual({
        lastErrorCause: 'timeout',
        providerDocumentId: null,
        providerRequestKey: first.attemptId,
        status: 'failed',
      })
      const inherited = resolveInheritedProviderRequestKey(history)
      expect(inherited).toBe(first.attemptId)

      const second = await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'second', inherited)),
      )
      expect(second.attemptNumber).toBe(2)
      await admin`
        update nfse_issuance_attempts set status = 'rejected', last_error_cause = null
        where id = ${second.attemptId}
      `

      const rejected = await repository.transaction({ companyId }, (transaction) =>
        transaction.findLatestIssueAttempt({ invoiceId }),
      )
      expect(resolveInheritedProviderRequestKey(rejected)).toBeUndefined()
      const third = await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'third')),
      )

      const rows = await admin<{ id: string; provider_request_key: string | null }[]>`
        select id, provider_request_key from nfse_issuance_attempts
        where invoice_id = ${invoiceId} order by attempt_number
      `
      expect(rows.map((row) => row.provider_request_key)).toEqual([
        first.attemptId,
        first.attemptId,
        third.attemptId,
      ])
    },
    120_000,
  )

  testWithPostgres(
    'uma nota aceita pelo provedor (providerDocumentId) não é ambígua nem com timeout',
    async () => {
      const { admin, database } = shared!
      const { companyId, invoiceId } = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)
      const attempt = await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'accepted')),
      )
      await admin`
        update nfse_issuance_attempts set status = 'failed', last_error_cause = 'timeout'
        where id = ${attempt.attemptId}
      `
      await admin`update nfse_service_invoices set provider_document_id = '98765' where id = ${invoiceId}`

      const history = await repository.transaction({ companyId }, (transaction) =>
        transaction.findLatestIssueAttempt({ invoiceId }),
      )

      expect(history?.providerDocumentId).toBe('98765')
      expect(resolveInheritedProviderRequestKey(history)).toBeUndefined()
    },
    120_000,
  )

  testWithPostgres(
    'o histórico não atravessa empresas: outra empresa não lê a emissão desta nota',
    async () => {
      const { admin, database } = shared!
      const { companyId, invoiceId } = await seedInvoice(admin)
      const other = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)
      await repository.transaction({ companyId }, (transaction) =>
        transaction.createAttempt(attemptInput(invoiceId, 'tenant')),
      )

      const crossTenant = await repository.transaction(
        { companyId: other.companyId },
        (transaction) => transaction.findLatestIssueAttempt({ invoiceId }),
      )

      expect(crossTenant).toBeNull()
    },
    120_000,
  )
})
