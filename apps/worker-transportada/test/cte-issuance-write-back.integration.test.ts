/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import {
  cteBatchEvents,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
} from '../src/database/cte-issuance-execution.schema.js'
import { storedObjects } from '../src/database/nfe.schema.js'
import { DrizzleCteIssuanceWriteBackRepository } from '../src/cte-issuance/infrastructure/drizzle-cte-issuance-write-back.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SHA256 = 'a'.repeat(64)
const CTE_ACCESS_KEY = '35260712345678000190570070000000011000000019'
const CTE_REDELIVERY_ACCESS_KEY = '35260712345678000190570070000000021000000027'
const CTE_XML_SHA256 = 'b'.repeat(64)

type SeededItem = {
  readonly attemptId: string
  readonly batchItemId: string
}

describeDatabase('CT-e issuance write-back (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const items: SeededItem[] = []

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleCteIssuanceWriteBackRepository(database)

  async function seedItem(ordinal: number): Promise<SeededItem> {
    const storedObjectId = crypto.randomUUID()
    const nfeDocumentId = crypto.randomUUID()
    const freightCalculationId = crypto.randomUUID()
    const batchItemId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    const attemptId = crypto.randomUUID()

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
          values (${nfeDocumentId}, ${companyId}, ${`${ordinal}${'1'.repeat(43)}`},
                  ${`protocol-${ordinal}`}, ${userId}, '0.0000', ${importId},
                  '2026-07-27T12:00:00.000Z', '55', ${String(ordinal)}, 'Venda', '1', '10000.0000',
                  '1', 'upload', 'authorized', '10000.0000', ${storedObjectId}, ${SHA256})`,
    )
    await database.execute(
      sql`insert into freight_calculations
            (id, company_id, adjustments, base_amount, calculated_amount, calculation_details,
             correlation_id, created_by_user_id, freight_rule_id, freight_rule_version_id,
             idempotency_key, nfe_document_id, percentage, request_fingerprint, rule_snapshot,
             rule_version, status, total_amount)
          values (${freightCalculationId}, ${companyId}, '[]'::jsonb, '10000.0000', '450.0000',
                  '{}'::jsonb, ${`correlation-freight-${ordinal}-${batchId}`}, ${userId},
                  ${freightRuleId}, ${freightRuleVersionId}, ${`freight-${ordinal}-${batchId}`},
                  ${nfeDocumentId}, '0.045000', ${`fingerprint-freight-${ordinal}-${batchId}`},
                  '{}'::jsonb, 1, 'snapshotted', '450.0000')`,
    )
    await database.execute(
      sql`insert into cte_batch_items
            (id, company_id, batch_id, nfe_document_id, freight_calculation_id, calculation_snapshot, position)
          values (${batchItemId}, ${companyId}, ${batchId}, ${nfeDocumentId},
                  ${freightCalculationId}, '{}'::jsonb, ${ordinal})`,
    )
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
             fiscal_series, fiscal_number, reservation_id, correlation_id)
          values (${attemptId}, ${companyId}, ${batchId}, ${batchItemId}, 'issue', 1, 'pending',
                  ${`cte-${ordinal}-${batchId}`}, ${`fingerprint-${ordinal}-${batchId}`},
                  ${`request-${ordinal}-${batchId}`}, 'homologation', '7', ${ordinal},
                  ${reservationId}, ${`correlation-cte-${ordinal}-${batchId}`})`,
    )

    return { attemptId, batchItemId }
  }

  beforeAll(async () => {
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${membershipId}, ${userId}, ${companyId}, 'active')`,
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
          values (${fiscalSequenceId}, ${companyId}, 'homologation', 2, 'cte', 3, 7, 1)`,
    )
    await database.execute(
      sql`insert into cte_batches
            (id, company_id, correlation_id, idempotency_fingerprint, idempotency_key, name,
             operator_user_id, status, version)
          values (${batchId}, ${companyId}, ${`correlation-batch-${batchId}`},
                  ${`fingerprint-batch-${batchId}`}, ${`batch-${batchId}`}, ${`Lote ${batchId}`},
                  ${userId}, 'submitted', 1)`,
    )

    items.push(await seedItem(1), await seedItem(2))
  })

  afterAll(async () => {
    await database.execute(sql`delete from cte_issuance_events where company_id = ${companyId}`)
    await database.execute(sql`delete from cte_batch_events where company_id = ${companyId}`)
    await database.execute(sql`delete from cte_fiscal_documents where company_id = ${companyId}`)
    await database.execute(sql`delete from cte_issuance_attempts where company_id = ${companyId}`)
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
    await database.execute(sql`delete from identity_users where id = ${userId}`)
    // Reservas fiscais são append-only e prendem sequência e empresa por FK restrita: o resíduo
    // fica contido no banco dedicado da integração do worker.
    await provider.close()
  })

  async function readBatchStatus(): Promise<string | undefined> {
    const [row] = await database
      .select({ status: cteBatches.status })
      .from(cteBatches)
      .where(and(eq(cteBatches.companyId, companyId), eq(cteBatches.id, batchId)))
      .limit(1)
    return row?.status
  }

  async function readAttemptStatus(attemptId: string): Promise<string | undefined> {
    const [row] = await database
      .select({ status: cteIssuanceAttempts.status })
      .from(cteIssuanceAttempts)
      .where(
        and(eq(cteIssuanceAttempts.companyId, companyId), eq(cteIssuanceAttempts.id, attemptId)),
      )
      .limit(1)
    return row?.status
  }

  it('moves the batch to in_flight when the first item starts transmitting', async () => {
    const [first] = items
    await repository.recordInFlight({
      attemptId: first!.attemptId,
      batchId,
      batchItemId: first!.batchItemId,
      companyId,
      occurredAt: new Date('2026-07-27T13:00:00.000Z'),
    })

    expect(await readAttemptStatus(first!.attemptId)).toBe('in_flight')
    expect(await readBatchStatus()).toBe('in_flight')
  })

  it('keeps the batch in flight while a sibling item has not settled', async () => {
    const [first] = items
    await repository.recordAuthorized({
      accessKey: '35260712345678000190570070001000000011000000019',
      attemptId: first!.attemptId,
      batchId,
      batchItemId: first!.batchItemId,
      companyId,
      occurredAt: new Date('2026-07-27T13:01:00.000Z'),
      protocol: '135260000123456',
    })

    expect(await readAttemptStatus(first!.attemptId)).toBe('authorized')
    expect(await readBatchStatus()).toBe('in_flight')
  })

  it('closes the batch as error when a sibling item is rejected by SEFAZ', async () => {
    const second = items[1]
    await repository.recordRejected({
      attemptId: second!.attemptId,
      batchId,
      batchItemId: second!.batchItemId,
      companyId,
      errorCode: '539',
      occurredAt: new Date('2026-07-27T13:02:00.000Z'),
    })

    expect(await readAttemptStatus(second!.attemptId)).toBe('rejected')
    expect(await readBatchStatus()).toBe('error')
  })

  it('records one issuance event per transition and one batch event per status change', async () => {
    const issuanceEvents = await database
      .select({
        attemptId: cteIssuanceEvents.attemptId,
        eventName: cteIssuanceEvents.eventName,
        payload: cteIssuanceEvents.payload,
      })
      .from(cteIssuanceEvents)
      .where(eq(cteIssuanceEvents.companyId, companyId))
      .orderBy(asc(cteIssuanceEvents.occurredAt))

    expect(issuanceEvents.map((event) => event.eventName)).toEqual([
      'in_flight',
      'authorized',
      'reconciliation_required',
      'rejected',
    ])
    expect(issuanceEvents[1]?.payload).toEqual({
      accessKey: '35260712345678000190570070001000000011000000019',
      protocol: '135260000123456',
    })
    expect(issuanceEvents[2]?.payload).toEqual({ reason: 'authorized_xml_missing' })
    expect(issuanceEvents[3]?.payload).toEqual({ errorCode: '539' })

    const batchEvents = await database
      .select({ eventName: cteBatchEvents.eventName, payload: cteBatchEvents.payload })
      .from(cteBatchEvents)
      .where(eq(cteBatchEvents.companyId, companyId))
      .orderBy(asc(cteBatchEvents.occurredAt))

    expect(batchEvents).toEqual([
      { eventName: 'in_flight', payload: { previousStatus: 'submitted' } },
      { eventName: 'error', payload: { previousStatus: 'in_flight' } },
    ])
  })

  it('persists the authorized XML object and the fiscal document once per item', async () => {
    const third = await seedItem(3)
    const authorized = {
      attemptId: third.attemptId,
      batchId,
      batchItemId: third.batchItemId,
      companyId,
      fiscalDocument: {
        accessKey: CTE_ACCESS_KEY,
        authorizationProtocol: '135260000654321',
        fiscalEnvironment: 'homologation' as const,
        fiscalNumber: 3n,
        fiscalSeries: '7',
        xml: {
          bucket: 'integration',
          key: `tenants/${companyId}/cte-documents/${CTE_ACCESS_KEY}/authorized.xml`,
          objectId: crypto.randomUUID(),
          sha256: CTE_XML_SHA256,
          sizeBytes: 512,
        },
      },
      occurredAt: new Date('2026-07-27T13:03:00.000Z'),
      protocol: '135260000654321',
    }

    await repository.recordAuthorized(authorized)
    await repository.recordAuthorized({
      ...authorized,
      fiscalDocument: {
        ...authorized.fiscalDocument,
        xml: { ...authorized.fiscalDocument.xml, objectId: crypto.randomUUID() },
      },
      occurredAt: new Date('2026-07-27T13:04:00.000Z'),
    })

    const documents = await database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        fiscalNumber: cteFiscalDocuments.fiscalNumber,
        status: cteFiscalDocuments.status,
        xmlObjectId: cteFiscalDocuments.xmlObjectId,
        xmlSha256: cteFiscalDocuments.xmlSha256,
      })
      .from(cteFiscalDocuments)
      .where(
        and(
          eq(cteFiscalDocuments.companyId, companyId),
          eq(cteFiscalDocuments.batchItemId, third.batchItemId),
        ),
      )

    expect(documents).toEqual([
      {
        accessKey: CTE_ACCESS_KEY,
        fiscalNumber: 3n,
        status: 'authorized',
        xmlObjectId: authorized.fiscalDocument.xml.objectId,
        xmlSha256: CTE_XML_SHA256,
      },
    ])

    const objects = await database
      .select({ id: storedObjects.id, purpose: storedObjects.purpose })
      .from(storedObjects)
      .where(
        and(
          eq(storedObjects.companyId, companyId),
          eq(storedObjects.objectKey, authorized.fiscalDocument.xml.key),
        ),
      )

    expect(objects).toEqual([
      { id: authorized.fiscalDocument.xml.objectId, purpose: 'cte_document' },
    ])
    expect(await readAttemptStatus(third.attemptId)).toBe('authorized')
  })

  it('never overwrites an authorized attempt when a redelivery reports rejection', async () => {
    const fourth = await seedItem(4)
    await repository.recordInFlight({
      attemptId: fourth.attemptId,
      batchId,
      batchItemId: fourth.batchItemId,
      companyId,
      occurredAt: new Date('2026-07-27T13:05:00.000Z'),
    })
    await repository.recordAuthorized({
      accessKey: CTE_REDELIVERY_ACCESS_KEY,
      attemptId: fourth.attemptId,
      batchId,
      batchItemId: fourth.batchItemId,
      companyId,
      fiscalDocument: {
        accessKey: CTE_REDELIVERY_ACCESS_KEY,
        authorizationProtocol: '135260000987654',
        fiscalEnvironment: 'homologation',
        fiscalNumber: 4n,
        fiscalSeries: '7',
        xml: {
          bucket: 'integration',
          key: `tenants/${companyId}/cte-documents/${fourth.batchItemId}/authorized.xml`,
          objectId: crypto.randomUUID(),
          sha256: CTE_XML_SHA256,
          sizeBytes: 512,
        },
      },
      occurredAt: new Date('2026-07-27T13:06:00.000Z'),
      protocol: '135260000987654',
    })

    await repository.recordRejected({
      attemptId: fourth.attemptId,
      batchId,
      batchItemId: fourth.batchItemId,
      companyId,
      errorCode: '539',
      occurredAt: new Date('2026-07-27T13:07:00.000Z'),
    })

    expect(await readAttemptStatus(fourth.attemptId)).toBe('authorized')

    const events = await database
      .select({ eventName: cteIssuanceEvents.eventName })
      .from(cteIssuanceEvents)
      .where(
        and(
          eq(cteIssuanceEvents.companyId, companyId),
          eq(cteIssuanceEvents.attemptId, fourth.attemptId),
        ),
      )
      .orderBy(asc(cteIssuanceEvents.occurredAt))

    expect(events.map((event) => event.eventName)).toEqual(['in_flight', 'authorized'])
  })
})
