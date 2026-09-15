/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { DrizzleCteBatchDocumentAuthorizationRepository } from '../src/cte-issuance/infrastructure/drizzle-cte-batch-document-authorization.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SHA256 = 'c'.repeat(64)

type SeededItem = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly documentIds: readonly string[]
}

/**
 * Spec 149, revisão final: com `groupingMode: 'sender_recipient'` o item carrega N notas em
 * `cte_batch_item_documents`; `cte_batch_items.nfe_document_id` é só a principal.
 */
describeDatabase('CT-e batch item document authorization (integration)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  let ordinal = 0

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleCteBatchDocumentAuthorizationRepository(database)

  async function seedDocument(status: 'authorized' | 'cancelled'): Promise<string> {
    ordinal += 1
    const storedObjectId = crypto.randomUUID()
    const nfeDocumentId = crypto.randomUUID()
    await database.execute(
      sql`insert into stored_objects
            (id, company_id, bucket, object_key, mime_type, provider, purpose, sha256, size_bytes, status)
          values (${storedObjectId}, ${companyId}, 'integration', ${`nfe/${ordinal}-${batchId}.xml`},
                  'application/xml', 's3', 'nfe_document', ${SHA256}, 100, 'final')`,
    )
    await database.execute(
      sql`insert into nfe_documents
            (id, company_id, access_key, authorization_protocol, created_by_user_id, freight_value,
             import_id, issued_at, model, number, operation_nature, operation_type, products_value,
             series, source, status, total_value, xml_object_id, xml_sha256)
          values (${nfeDocumentId}, ${companyId}, ${`${String(ordinal).padStart(2, '0')}${'7'.repeat(42)}`},
                  ${`protocol-${ordinal}`}, ${userId}, '0.0000', ${importId},
                  '2026-09-15T12:00:00.000Z', '55', ${String(ordinal)}, 'Venda', '1', '10000.0000',
                  '1', 'upload', ${status}, '10000.0000', ${storedObjectId}, ${SHA256})`,
    )
    return nfeDocumentId
  }

  async function seedItem(params: {
    readonly attemptStatus?: string
    readonly documentIds: readonly string[]
    readonly lastErrorCause?: string
  }): Promise<SeededItem> {
    ordinal += 1
    const [primaryDocumentId] = params.documentIds
    const freightCalculationId = crypto.randomUUID()
    const batchItemId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    const attemptId = crypto.randomUUID()

    await database.execute(
      sql`insert into freight_calculations
            (id, company_id, adjustments, base_amount, calculated_amount, calculation_details,
             correlation_id, created_by_user_id, freight_rule_id, freight_rule_version_id,
             idempotency_key, nfe_document_id, percentage, request_fingerprint, rule_snapshot,
             rule_version, status, total_amount)
          values (${freightCalculationId}, ${companyId}, '[]'::jsonb, '10000.0000', '450.0000',
                  '{}'::jsonb, ${`correlation-freight-${ordinal}-${batchId}`}, ${userId},
                  ${freightRuleId}, ${freightRuleVersionId}, ${`freight-${ordinal}-${batchId}`},
                  ${primaryDocumentId!}, '0.045000', ${`fingerprint-freight-${ordinal}-${batchId}`},
                  '{}'::jsonb, 1, 'snapshotted', '450.0000')`,
    )
    await database.execute(
      sql`insert into cte_batch_items
            (id, company_id, batch_id, nfe_document_id, freight_calculation_id, calculation_snapshot, position)
          values (${batchItemId}, ${companyId}, ${batchId}, ${primaryDocumentId!},
                  ${freightCalculationId}, '{}'::jsonb, ${ordinal})`,
    )
    let position = 0
    for (const documentId of params.documentIds) {
      position += 1
      await database.execute(
        sql`insert into cte_batch_item_documents
              (id, company_id, batch_id, item_id, nfe_document_id, position)
            values (${crypto.randomUUID()}, ${companyId}, ${batchId}, ${batchItemId},
                    ${documentId}, ${position})`,
      )
    }
    await database.execute(
      sql`insert into fiscal_sequence_reservations
            (id, company_id, fiscal_sequence_id, number, reservation_key)
          values (${reservationId}, ${companyId}, ${fiscalSequenceId}, ${ordinal},
                  ${`reservation-${ordinal}-${batchId}`})`,
    )
    await database.execute(
      sql`insert into cte_issuance_attempts
            (id, company_id, batch_id, batch_item_id, attempt_kind, attempt_number, status,
             idempotency_key, idempotency_fingerprint, request_fingerprint, fiscal_environment,
             fiscal_series, fiscal_number, reservation_id, correlation_id, last_error_cause)
          values (${attemptId}, ${companyId}, ${batchId}, ${batchItemId}, 'issue', 1,
                  ${params.attemptStatus ?? 'pending'},
                  ${`cte-${ordinal}-${batchId}`}, ${`fingerprint-${ordinal}-${batchId}`},
                  ${`request-${ordinal}-${batchId}`}, 'homologation', '7', ${ordinal},
                  ${reservationId}, ${`correlation-cte-${ordinal}-${batchId}`},
                  ${params.lastErrorCause ?? null})`,
    )

    return { attemptId, batchItemId, documentIds: params.documentIds }
  }

  beforeAll(async () => {
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into companies (id, status) values (${otherCompanyId}, 'active')`,
    )
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
    await database.execute(
      sql`insert into nfe_imports
            (id, company_id, correlation_id, idempotency_key, request_fingerprint,
             requested_by_user_id, source, status)
          values (${importId}, ${companyId}, ${`correlation-import-${batchId}`},
                  ${`import-${batchId}`}, ${`fingerprint-import-${batchId}`}, ${userId},
                  'upload', 'completed')`,
    )
    await database.execute(
      sql`insert into freight_rules
            (id, company_id, created_by_user_id, current_version, name, priority, status, type)
          values (${freightRuleId}, ${companyId}, ${userId}, 1, ${`Frete ${batchId}`}, 1, 'active',
                  'percentage_of_invoice_total')`,
    )
    await database.execute(
      sql`insert into freight_rule_versions
            (id, company_id, created_by_user_id, filters, freight_rule_id, percentage, snapshot,
             status, valid_from, version)
          values (${freightRuleVersionId}, ${companyId}, ${userId}, '{}'::jsonb, ${freightRuleId},
                  '0.045000', '{}'::jsonb, 'active', '2026-01-01T00:00:00.000Z', 1)`,
    )
    await database.execute(
      sql`insert into fiscal_sequences
            (id, company_id, environment, last_reserved_number, model, next_number, series, version)
          values (${fiscalSequenceId}, ${companyId}, 'homologation', 50, 'cte', 51, 7, 1)`,
    )
    await database.execute(
      sql`insert into cte_batches
            (id, company_id, correlation_id, idempotency_fingerprint, idempotency_key, name,
             operator_user_id, status, version)
          values (${batchId}, ${companyId}, ${`correlation-batch-${batchId}`},
                  ${`fingerprint-batch-${batchId}`}, ${`batch-${batchId}`}, ${`Lote ${batchId}`},
                  ${userId}, 'submitted', 1)`,
    )
  })

  afterAll(async () => {
    await database.execute(sql`delete from cte_issuance_attempts where company_id = ${companyId}`)
    await database.execute(
      sql`delete from cte_batch_item_documents where company_id = ${companyId}`,
    )
    await database.execute(sql`delete from cte_batch_items where company_id = ${companyId}`)
    await database.execute(sql`delete from cte_batches where company_id = ${companyId}`)
    await database.execute(sql`delete from freight_calculations where company_id = ${companyId}`)
    await database.execute(sql`delete from freight_rule_versions where company_id = ${companyId}`)
    await database.execute(sql`delete from freight_rules where company_id = ${companyId}`)
    await database.execute(sql`delete from nfe_documents where company_id = ${companyId}`)
    await database.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
    await database.execute(sql`delete from stored_objects where company_id = ${companyId}`)
    await database.execute(
      sql`delete from user_company_memberships where company_id = ${companyId}`,
    )
    await database.execute(sql`delete from companies where id = ${otherCompanyId}`)
    await database.execute(sql`delete from identity_users where id = ${userId}`)
    // Reservas fiscais são append-only e prendem sequência e empresa por FK restrita: o resíduo
    // fica contido no banco dedicado da integração do worker.
    await provider.close()
  })

  it('blocks an item of two notes when the second one was cancelled', async () => {
    const item = await seedItem({
      documentIds: [await seedDocument('authorized'), await seedDocument('cancelled')],
    })

    expect(await repository.isAuthorized({ batchItemId: item.batchItemId, companyId })).toBe(false)
  })

  it('lets an item of two authorized notes proceed', async () => {
    const item = await seedItem({
      documentIds: [await seedDocument('authorized'), await seedDocument('authorized')],
    })

    expect(await repository.isAuthorized({ batchItemId: item.batchItemId, companyId })).toBe(true)
  })

  it('blocks an item whose notes are not in cte_batch_item_documents at all', async () => {
    const primary = await seedDocument('authorized')
    const item = await seedItem({ documentIds: [primary] })
    await database.execute(
      sql`delete from cte_batch_item_documents
           where company_id = ${companyId} and item_id = ${item.batchItemId}`,
    )

    expect(await repository.isAuthorized({ batchItemId: item.batchItemId, companyId })).toBe(false)
  })

  it('never answers for the item of another company', async () => {
    const item = await seedItem({
      documentIds: [await seedDocument('authorized'), await seedDocument('authorized')],
    })

    expect(
      await repository.isAuthorized({ batchItemId: item.batchItemId, companyId: otherCompanyId }),
    ).toBe(false)
  })

  it('reads whether the attempt may already be at SEFAZ from its own state', async () => {
    const document = await seedDocument('authorized')
    const pending = await seedItem({ documentIds: [document] })
    const inFlight = await seedItem({
      attemptStatus: 'in_flight',
      documentIds: [await seedDocument('authorized')],
    })
    const timedOut = await seedItem({
      attemptStatus: 'retry_scheduled',
      documentIds: [await seedDocument('authorized')],
      lastErrorCause: 'ETIMEDOUT',
    })
    const burned = await seedItem({
      attemptStatus: 'retry_scheduled',
      documentIds: [await seedDocument('authorized')],
      lastErrorCause: 'fiscal_number_burned:539',
    })

    const read = (attemptId: string, scope = companyId) =>
      repository.mayHaveReachedSefaz({ attemptId, companyId: scope })
    expect(await read(pending.attemptId)).toBe(false)
    expect(await read(inFlight.attemptId)).toBe(true)
    expect(await read(timedOut.attemptId)).toBe(true)
    expect(await read(burned.attemptId)).toBe(false)
    expect(await read(inFlight.attemptId, otherCompanyId)).toBe(false)
  })
})
