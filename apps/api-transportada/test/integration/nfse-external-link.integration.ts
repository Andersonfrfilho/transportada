/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 250 T5.2 contra Postgres: o vínculo com a nota emitida no portal grava nota, tentativa,
 * evento e auditoria na mesma transação, e o índice único (empresa, `id_nota`) recusa o segundo.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { DrizzleNfseInvoiceRepository } from '../../src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'

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
  const name = `transportada_250_t52_${crypto.randomUUID().replaceAll('-', '')}`
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

async function seedInvoice(
  raw: SQL,
): Promise<{ companyId: string; invoiceId: string; userId: string }> {
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
  await raw`
    update nfse_service_invoices
    set status = 'rejected', rejection_code = 'E1', rejection_message = 'Rejeitada'
    where id = ${invoiceId}
  `
  return { companyId, invoiceId, userId }
}

const NOW = '2026-10-07T12:00:00.000Z'

function linkInput(invoiceId: string, suffix: string) {
  return {
    attemptKind: 'issue' as const,
    correlationId: `nfse-250-link-${suffix}`,
    externalLink: true as const,
    fiscalEnvironment: 'homologation' as const,
    idempotencyKey: `nfse-250-link-key-${crypto.randomUUID()}`,
    invoiceId,
    requestFingerprint: 'e'.repeat(64),
  }
}

async function linkInTransaction(params: {
  readonly companyId: string
  readonly invoiceId: string
  readonly providerDocumentId: string
  readonly repository: DrizzleNfseInvoiceRepository
  readonly userId: string
}): Promise<string> {
  const { companyId, invoiceId, providerDocumentId, repository, userId } = params
  return repository.transaction({ companyId }, async (transaction) => {
    const attempt = await transaction.createAttempt(linkInput(invoiceId, providerDocumentId))
    await transaction.markExternallyLinked({
      invoiceId,
      providerDocumentId,
      requestedAt: NOW,
      status: 'pending_authorization',
    })
    await transaction.appendEvent({
      attemptId: attempt.attemptId,
      eventName: 'accepted',
      invoiceId,
      occurredAt: NOW,
      payload: { source: 'external_link' },
    })
    await transaction.appendAudit({
      action: 'nfse.invoice.external_link',
      actorUserId: userId,
      after: { providerDocumentId, status: 'pending_authorization' },
      before: { status: 'rejected' },
      companyId,
      correlationId: `nfse-250-link-${providerDocumentId}`,
      invoiceId,
      permission: 'nfse.issue',
    })
    return attempt.attemptId
  })
}

describe('vínculo com a nota emitida no portal (spec 250 T5.2)', () => {
  testWithPostgres(
    'grava nota, tentativa aceita sem chave, evento e auditoria juntos',
    async () => {
      const { admin, database } = shared!
      const { companyId, invoiceId, userId } = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)

      const attemptId = await linkInTransaction({
        companyId,
        invoiceId,
        providerDocumentId: '4821',
        repository,
        userId,
      })

      const [invoice] = await admin<
        {
          provider_document_id: string
          rejection_code: string | null
          status: string
          next: Date | null
        }[]
      >`
        select provider_document_id, rejection_code, status, next_status_check_at as next
        from nfse_service_invoices where id = ${invoiceId}
      `
      expect(invoice?.status).toBe('pending_authorization')
      expect(invoice?.provider_document_id).toBe('4821')
      expect(invoice?.rejection_code).toBeNull()
      expect(invoice?.next?.toISOString()).toBe(NOW)

      const [attempt] = await admin<{ provider_request_key: string | null; status: string }[]>`
        select provider_request_key, status from nfse_issuance_attempts where id = ${attemptId}
      `
      expect(attempt).toEqual({ provider_request_key: null, status: 'accepted' })

      const [events] = await admin<{ total: string }[]>`
        select count(*)::text as total from nfse_issuance_events where attempt_id = ${attemptId}
      `
      expect(events?.total).toBe('1')
      const [outbox] = await admin<{ total: string }[]>`
        select count(*)::text as total from nfse_issuance_outbox where invoice_id = ${invoiceId}
      `
      expect(outbox?.total).toBe('0')
      const [audit] = await admin<{ action: string; actor_user_id: string; permission: string }[]>`
        select action, actor_user_id, permission from audit_logs where entity_id = ${invoiceId}
      `
      expect(audit).toEqual({
        action: 'nfse.invoice.external_link',
        actor_user_id: userId,
        permission: 'nfse.issue',
      })
    },
    120_000,
  )

  testWithPostgres(
    'o mesmo id_nota em outra nota da empresa é recusado e a transação inteira volta',
    async () => {
      const { admin, database } = shared!
      const first = await seedInvoice(admin)
      const repository = new DrizzleNfseInvoiceRepository(database.db)
      await linkInTransaction({ ...first, providerDocumentId: '777', repository })

      const secondInvoiceId = crypto.randomUUID()
      await admin`
        insert into nfse_service_invoices (
          id, company_id, emission_profile_id, taker_tax_id, taker_legal_name, service_amount,
          description, calculation_snapshot, created_by_user_id, status, rejection_code, rejection_message
        )
        select ${secondInvoiceId}, company_id, emission_profile_id, taker_tax_id, taker_legal_name,
          service_amount, description, calculation_snapshot, created_by_user_id, 'rejected', 'E1', 'x'
        from nfse_service_invoices where id = ${first.invoiceId}
      `

      let code: unknown
      try {
        await linkInTransaction({
          companyId: first.companyId,
          invoiceId: secondInvoiceId,
          providerDocumentId: '777',
          repository,
          userId: first.userId,
        })
      } catch (error) {
        code = (error as { code?: unknown }).code
      }

      expect(code).toBe('NFSE_PROVIDER_DOCUMENT_ALREADY_LINKED')
      const [attempts] = await admin<{ total: string }[]>`
        select count(*)::text as total from nfse_issuance_attempts where invoice_id = ${secondInvoiceId}
      `
      expect(attempts?.total).toBe('0')
      const [audits] = await admin<{ total: string }[]>`
        select count(*)::text as total from audit_logs where entity_id = ${secondInvoiceId}
      `
      expect(audits?.total).toBe('0')
    },
    120_000,
  )
})
