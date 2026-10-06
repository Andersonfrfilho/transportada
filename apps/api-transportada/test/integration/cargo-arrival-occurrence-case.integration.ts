/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4a (ADR-0094 §9.5, ajuste 2): a tratativa da avaria de recebimento conduzida pelas rotas
 * reais de `/trip-occurrences/:id/case/*` — as seis ações do escritório e o acerto — sobre uma
 * ocorrência SEM viagem (dona `cargo_arrival_document_id`). Nada de UPDATE direto: cada passo é HTTP.
 */
import { describe, expect, test } from 'bun:test'

import { withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import {
  caseStep,
  hasTestDatabase,
  openDamage,
  returnAction,
  seedDamaged,
  statusAndCode,
} from '../fixtures/cargo-arrival-damaged.fixture.js'
import {
  createOccurrenceHandler,
  seedOccurrenceType,
} from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip

type Office = ReturnType<typeof createOccurrenceHandler>

async function listedCaseStatus(
  office: Office,
  input: { readonly arrivalId: string; readonly occurrenceId: string },
): Promise<string | undefined> {
  const response = await office(
    jsonRequest({ method: 'GET', path: `/cargo-arrivals/${input.arrivalId}/occurrences` }),
  )
  const body = (await response.json()) as {
    data: { occurrences: { case: { status: string } | null; id: string }[] }
  }
  return body.data.occurrences.find((occurrence) => occurrence.id === input.occurrenceId)?.case
    ?.status
}

describe('a tratativa da avaria de recebimento (spec 237 T3.4a, ADR-0094 §9.5 ajuste 2)', () => {
  testWithPostgres(
    'recorded → under_review → awaiting_contractor → decided → closed, e a devolução conclui no meio',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const office = createOccurrenceHandler({ database })
        const { arrivalId, occurrenceId } = damaged
        const act = (action: string, body?: unknown) =>
          caseStep(office, { action, body, occurrenceId })

        expect(await listedCaseStatus(office, damaged)).toBe('recorded')
        expect(await act('review')).toEqual([200, 'changed:under_review'])
        expect(await act('contractor-submission')).toEqual([200, 'changed:awaiting_contractor'])
        expect(await act('decision', { kind: 'other', note: 'devolver ao contratante' })).toEqual([
          200,
          'changed:decided',
        ])
        expect(await listedCaseStatus(office, damaged)).toBe('decided')

        const returnStep = (action: 'return-complete' | 'return-mark') =>
          office(
            returnAction({
              action,
              arrivalId,
              body: action === 'return-mark' ? { occurrenceId } : {},
              documentId: damaged.documentIds[0],
            }),
          ).then(statusAndCode)
        expect(await returnStep('return-mark')).toEqual([200, 'changed'])
        expect(await returnStep('return-complete')).toEqual([200, 'changed'])

        expect(await act('closure')).toEqual([200, 'changed:closed'])
        expect(await listedCaseStatus(office, damaged)).toBe('closed')
      })
    },
  )

  testWithPostgres(
    'devolver ao depósito e cancelar a tratativa, cada uma na sua ocorrência',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const office = createOccurrenceHandler({ database })
        const typeId = await seedOccurrenceType(database, {
          name: 'Divergência na chegada',
          stage: 'receiving',
        })
        const returned = damaged.occurrenceId
        const cancelled = await openDamage({
          arrivalId: damaged.arrivalId,
          database,
          documentId: damaged.documentIds[0],
          typeId,
        })

        await caseStep(office, { action: 'review', occurrenceId: returned })
        expect(
          await caseStep(office, {
            action: 'warehouse-return',
            body: { note: 'caixa voltou ao estoque' },
            occurrenceId: returned,
          }),
        ).toEqual([200, 'changed:returned_to_warehouse'])
        expect(
          await caseStep(office, {
            action: 'cancel',
            body: { note: 'aberta por engano' },
            occurrenceId: cancelled,
          }),
        ).toEqual([200, 'changed:cancelled'])
        expect(await listedCaseStatus(office, { ...damaged, occurrenceId: cancelled })).toBe(
          'cancelled',
        )
      })
    },
  )

  testWithPostgres(
    'a decisão goods_paid fecha com o acerto por item, sem cobrança (a ocorrência não tem viagem)',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const office = createOccurrenceHandler({ database })
        const { occurrenceId } = damaged
        await caseStep(office, { action: 'review', occurrenceId })
        await caseStep(office, { action: 'contractor-submission', occurrenceId })
        await caseStep(office, {
          action: 'decision',
          body: { kind: 'goods_paid', note: 'a transportadora paga' },
          occurrenceId,
        })
        expect(await caseStep(office, { action: 'closure', occurrenceId })).toEqual([
          422,
          'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS',
        ])

        const settlement = await office(
          jsonRequest({
            body: {
              items: [
                {
                  amount: '120.0000',
                  amountSource: 'manual',
                  payerKind: 'carrier',
                  productCode: 'P1',
                },
              ],
            },
            method: 'PUT',
            path: `/trip-occurrences/${occurrenceId}/case/settlement`,
          }),
        )
        expect(await settlement.json()).toMatchObject({ data: { total: '120.0000' } })
        expect(await caseStep(office, { action: 'closure', occurrenceId })).toEqual([
          200,
          'changed:closed',
        ])
      })
    },
  )
})
