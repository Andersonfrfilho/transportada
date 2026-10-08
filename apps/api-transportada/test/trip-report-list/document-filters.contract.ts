/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 T3.2: o SQL que cada filtro de nota gera. O banco é um proxy que só registra a consulta —
 * a execução contra o Postgres está em `test/integration/trip-report-document-filters.integration.ts`.
 */
import { drizzle } from 'drizzle-orm/pg-proxy'
import { describe, expect, test } from 'bun:test'

import type { TripReportFilters } from '../../src/trips/domain/trip-report.types.js'
import { DrizzleTripReportRepository } from '../../src/trips/infrastructure/drizzle-trip-report.repository.js'
import type { TripDatabase } from '../../src/trips/infrastructure/trip-queryable.type.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000258'

async function captureQuery(
  filters: TripReportFilters,
): Promise<{ readonly params: readonly unknown[]; readonly sql: string }> {
  let captured = { params: [] as readonly unknown[], sql: '' }
  const database = drizzle(async (sql, params) => {
    captured = { params, sql }
    return { rows: [] }
  }) as unknown as TripDatabase
  await new DrizzleTripReportRepository(database).listRows({
    companyId: COMPANY_ID,
    query: { cursor: undefined, filters, limit: 10 },
  })
  return captured
}

describe('SQL dos filtros de nota do relatorio (spec 258 T3.2)', () => {
  test('a data e um intervalo semiaberto em UTC, cada lado so se informado', async () => {
    const both = await captureQuery({ issuedFrom: '2026-10-01', issuedUntil: '2026-10-07' })
    expect(both.sql).toContain('"trip_report_document"."issued_at" >= ($')
    expect(both.sql).toContain("::date)::timestamp AT TIME ZONE 'UTC'")
    expect(both.sql).toContain("::date + 1))::timestamp AT TIME ZONE 'UTC'")
    expect(both.params).toContain('2026-10-01')
    expect(both.params).toContain('2026-10-07')

    const onlyFrom = await captureQuery({ issuedFrom: '2026-10-01' })
    expect(onlyFrom.sql).not.toContain('::date + 1')
  })

  test('o numero compara so o que e numerico, em numeric e nunca em bigint', async () => {
    const range = await captureQuery({ numberFrom: '10', numberTo: '20' })
    expect(range.sql).toContain('case when "trip_report_document"."number" ~ $')
    expect(range.sql).toContain('"number"::numeric >= $')
    expect(range.sql).toContain('"number"::numeric <= $')
    expect(range.sql).not.toContain('bigint')

    const onlyTo = await captureQuery({ numberTo: '20' })
    expect(onlyTo.sql).not.toContain('::numeric >= $')
  })

  test('o emitente filtra por razao social e CNPJ, nunca pelo nome fantasia', async () => {
    const query = await captureQuery({
      emitterNameIn: ['Alfa Ltda'],
      emitterTaxIdIn: ['12.345.678/0001-99'],
    })
    expect(query.sql).toContain('"trip_report_emitter"."legal_name" in ($')
    expect(query.sql).toContain('"trip_report_emitter"."tax_id" in ($')
    expect(query.sql).not.toContain('"trip_report_emitter"."trade_name" in')
    expect(query.params).toContain('12345678000199')
  })

  test('cidade e UF do emitente leem o endereco lateral do emitente, escopado pela empresa', async () => {
    const query = await captureQuery({ emitterCityIn: ['Recife'], emitterStateIn: ['PE'] })
    expect(query.sql).toContain('"trip_report_emitter_address"."city" in ($')
    expect(query.sql).toContain('"trip_report_emitter_address"."state" in ($')
    expect(query.sql).toContain('"company_id" = "trip_report_emitter"."company_id"')
    expect(query.sql).toContain('"participant_id" = "trip_report_emitter"."id"')
  })

  test('o endereco compoe a mesma string do front e escapa o curinga', async () => {
    const query = await captureQuery({ emitterAddress: '50%_', recipientAddress: 'Rua' })
    expect(query.sql).toContain(
      'concat_ws(\' - \', nullif(concat_ws(\', \', nullif("trip_report_emitter_address"."street", \'\'), nullif("trip_report_emitter_address"."number", \'\')), \'\'), nullif("trip_report_emitter_address"."district", \'\'))',
    )
    expect(query.sql).toContain('"trip_report_recipient_address"."street"')
    expect(query.params).toContain('%50\\%\\_%')
    expect(query.params).toContain('%Rua%')
  })

  test('o destinatario filtra pela razao social com ilike escapado', async () => {
    const query = await captureQuery({ recipientName: 'a_b' })
    expect(query.sql).toContain('"trip_report_recipient"."legal_name" ilike $')
    expect(query.params).toContain('%a\\_b%')
  })

  test('a situacao fiscal e uma lista sobre o status da nota', async () => {
    const query = await captureQuery({ fiscalStatusIn: ['authorized', 'cancelled'] })
    expect(query.sql).toContain('"trip_report_document"."status" in ($')
    expect(query.params).toContain('cancelled')
  })

  test('cteIssued=issued exige nota autorizada e vinculo ativo, da empresa, em lote nao cancelado', async () => {
    const query = await captureQuery({ cteIssued: 'issued' })
    expect(query.sql).toContain('"trip_report_document"."status" = \'authorized\' and exists')
    expect(query.sql).toContain('from "cte_batch_item_documents" inner join "cte_batches" on')
    expect(query.sql).toContain(
      '"cte_batches"."company_id" = "cte_batch_item_documents"."company_id"',
    )
    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain(
      '"cte_batch_item_documents"."nfe_document_id" = "trip_report_document"."id"',
    )
    expect(query.sql).toContain('"cte_batches"."status" <> $')
    expect(query.sql).not.toContain('not (')
  })

  test('cteIssued=pending e o complemento exato de issued', async () => {
    const issued = await captureQuery({ cteIssued: 'issued' })
    const pending = await captureQuery({ cteIssued: 'pending' })
    expect(pending.sql).toContain(
      'not ("trip_report_document"."status" = \'authorized\' and exists',
    )
    expect(pending.params).toEqual(issued.params)
  })

  test('sem filtro de nota, a consulta nao ganha condicao nenhuma delas', async () => {
    const query = await captureQuery({})
    expect(query.sql).not.toContain('exists (select 1 from "cte_batch_item_documents"')
    expect(query.sql).not.toContain('::numeric >= $')
    expect(query.sql).not.toContain('AT TIME ZONE')
  })
})
