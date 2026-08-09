/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import {
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuancePayloads,
  fiscalSequences,
} from '../src/database/cte-issuance-execution.schema.js'
import { CTE_FISCAL_NUMBER_PROBE_LIMIT } from '../src/cte-issuance/domain/cte-rejection.policy.js'
import {
  DrizzleCteFiscalNumberProbeRepository,
  FISCAL_NUMBER_ADVANCED_EVENT,
} from '../src/cte-issuance/infrastructure/drizzle-cte-fiscal-number-probe.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SHA256 = 'a'.repeat(64)
const FIRST_RESERVED_NUMBER = 1
const FIRST_FREE_NUMBER = 2
const CTE_SERIES = '7'
const DUPLICATE_CODE = '539'

type SeededItem = {
  readonly attemptId: string
  readonly batchItemId: string
}

describeDatabase('CT-e fiscal number probe (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleCteFiscalNumberProbeRepository(database)

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
                  '2026-08-06T12:00:00.000Z', '55', ${String(ordinal)}, 'Venda', '1', '10000.0000',
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
                  ${`request-${ordinal}-${batchId}`}, 'homologation', ${CTE_SERIES},
                  ${FIRST_RESERVED_NUMBER}, ${reservationId}, ${`correlation-cte-${ordinal}-${batchId}`})`,
    )
    await database.execute(
      sql`insert into cte_issuance_payloads
            (id, company_id, batch_id, batch_item_id, attempt_id, payload, provider_config, payload_sha256)
          values (${crypto.randomUUID()}, ${companyId}, ${batchId}, ${batchItemId}, ${attemptId},
                  '{}'::jsonb,
                  jsonb_build_object('numeroCte', ${FIRST_RESERVED_NUMBER}::bigint,
                                     'serieCte', ${CTE_SERIES}::text),
                  ${SHA256})`,
    )

    return { attemptId, batchItemId }
  }

  function advance(item: SeededItem, code = DUPLICATE_CODE) {
    return repository.advance({
      attemptId: item.attemptId,
      batchItemId: item.batchItemId,
      burnedNumber: FIRST_RESERVED_NUMBER,
      companyId,
      environment: 'homologation',
      occurredAt: new Date('2026-08-06T13:00:00.000Z'),
      rejectionCode: code,
      series: CTE_SERIES,
    })
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
          values (${fiscalSequenceId}, ${companyId}, 'homologation', ${FIRST_RESERVED_NUMBER}, 'cte',
                  ${FIRST_FREE_NUMBER}, ${CTE_SERIES}, 1)`,
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
    await database.execute(sql`delete from cte_issuance_events where company_id = ${companyId}`)
    await database.execute(sql`delete from cte_issuance_payloads where company_id = ${companyId}`)
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

  /**
   * A tentativa e o payload carregam o número em lugares diferentes: o provedor lê o
   * `providerConfig`, a tela lê a tentativa. Deixar um dos dois para trás reemite o número queimado
   * ou mostra ao usuário um número que não foi transmitido.
   */
  it('advances the sequence and rewrites both the payload and the attempt', async () => {
    const item = await seedItem(1)

    expect(await advance(item)).toEqual({ nextNumber: FIRST_FREE_NUMBER, outcome: 'advanced' })

    const [payload] = await database
      .select({ providerConfig: cteIssuancePayloads.providerConfig })
      .from(cteIssuancePayloads)
      .where(
        and(
          eq(cteIssuancePayloads.companyId, companyId),
          eq(cteIssuancePayloads.attemptId, item.attemptId),
        ),
      )
    expect(payload?.providerConfig).toEqual({
      numeroCte: FIRST_FREE_NUMBER,
      serieCte: CTE_SERIES,
    })

    const [attempt] = await database
      .select({ fiscalNumber: cteIssuanceAttempts.fiscalNumber })
      .from(cteIssuanceAttempts)
      .where(
        and(
          eq(cteIssuanceAttempts.companyId, companyId),
          eq(cteIssuanceAttempts.id, item.attemptId),
        ),
      )
    expect(attempt?.fiscalNumber).toBe(BigInt(FIRST_FREE_NUMBER))

    const [sequence] = await database
      .select({ next: fiscalSequences.nextNumber, reserved: fiscalSequences.lastReservedNumber })
      .from(fiscalSequences)
      .where(eq(fiscalSequences.id, fiscalSequenceId))
    expect(sequence).toEqual({
      next: BigInt(FIRST_FREE_NUMBER + 1),
      reserved: BigInt(FIRST_FREE_NUMBER),
    })

    const [event] = await database
      .select({ name: cteIssuanceEvents.eventName, payload: cteIssuanceEvents.payload })
      .from(cteIssuanceEvents)
      .where(
        and(
          eq(cteIssuanceEvents.companyId, companyId),
          eq(cteIssuanceEvents.batchItemId, item.batchItemId),
        ),
      )
    expect(event).toEqual({
      name: FISCAL_NUMBER_ADVANCED_EVENT,
      payload: {
        burnedNumber: FIRST_RESERVED_NUMBER,
        newNumber: FIRST_FREE_NUMBER,
        reason: 'sefaz_duplicate_number',
        rejectionCode: DUPLICATE_CODE,
        series: CTE_SERIES,
      },
    })
  })

  /**
   * Cada sonda é uma emissão a mais no webservice da SEFAZ. O teto é contado no banco, a partir dos
   * próprios eventos, para sobreviver a restart do worker.
   */
  it('stops probing once the item reaches the ceiling', async () => {
    const item = await seedItem(2)

    for (let probe = 0; probe < CTE_FISCAL_NUMBER_PROBE_LIMIT; probe += 1) {
      expect((await advance(item)).outcome).toBe('advanced')
    }

    expect(await advance(item)).toEqual({ outcome: 'exhausted' })

    const events = await database
      .select({ occurredAt: cteIssuanceEvents.occurredAt })
      .from(cteIssuanceEvents)
      .where(
        and(
          eq(cteIssuanceEvents.companyId, companyId),
          eq(cteIssuanceEvents.batchItemId, item.batchItemId),
        ),
      )
      .orderBy(asc(cteIssuanceEvents.occurredAt))
    expect(events).toHaveLength(CTE_FISCAL_NUMBER_PROBE_LIMIT)
  })

  /** Só a duplicidade é sondável: avançar por outro motivo queimaria numeração sem razão. */
  it('never advances for a rejection other than the duplicate number', async () => {
    const item = await seedItem(3)

    const [before] = await database
      .select({ next: fiscalSequences.nextNumber })
      .from(fiscalSequences)
      .where(eq(fiscalSequences.id, fiscalSequenceId))

    expect(await advance(item, '204')).toEqual({ outcome: 'exhausted' })

    const [after] = await database
      .select({ next: fiscalSequences.nextNumber })
      .from(fiscalSequences)
      .where(eq(fiscalSequences.id, fiscalSequenceId))
    expect(after?.next).toBe(before?.next as bigint)

    const events = await database
      .select({ id: cteIssuanceEvents.id })
      .from(cteIssuanceEvents)
      .where(
        and(
          eq(cteIssuanceEvents.companyId, companyId),
          eq(cteIssuanceEvents.batchItemId, item.batchItemId),
        ),
      )
    expect(events).toHaveLength(0)
  })
})
