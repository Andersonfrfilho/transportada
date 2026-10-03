/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4: a resposta da API é entrada não confiável (`security.md` §3). As guardas conferem as
 * chaves EXATAS do formato real da API (`cargo-arrival-view.mapper.ts`): chave a mais ou a menos
 * recusa a resposta inteira, em cada nível.
 */
import { describe, expect, test } from 'bun:test'

import {
  toArrivalDetail,
  toArrivalPage,
  toAvailableDocumentPage,
  toBatchOutcomes,
  toCloseResult,
  toRegisterResult,
} from '@/modules/cargo-receiving/shared/cargoReceivingResponse.validation'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildAvailable, buildDetail, buildSummary } from '../fixtures/cargoReceiving.fixture'

function expectInvalid(run: () => unknown): void {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(CargoReceivingRequestError)
    expect((error as CargoReceivingRequestError).message).toBe('RESPONSE_INVALID')
    return
  }
  throw new Error('A resposta deveria ter sido recusada')
}

describe('a lista de chegadas (spec 237 T2.4)', () => {
  test('aceita o formato real: data e nextCursor no topo', () => {
    const page = toArrivalPage({ data: [buildSummary()], nextCursor: 'cursor-1' })

    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBe('cursor-1')
  })

  test('recusa chave a mais ou a menos no resumo', () => {
    expectInvalid(() => toArrivalPage({ data: [{ ...buildSummary(), companyId: 'x' }], nextCursor: null }))
    const { counts: _counts, ...missing } = buildSummary()
    expectInvalid(() => toArrivalPage({ data: [missing], nextCursor: null }))
  })

  test('recusa contagem malformada, situação desconhecida e cursor que não é texto', () => {
    expectInvalid(() =>
      toArrivalPage({ data: [{ ...buildSummary(), counts: { expected: 1 } }], nextCursor: null }),
    )
    expectInvalid(() =>
      toArrivalPage({ data: [{ ...buildSummary(), status: 'archived' }], nextCursor: null }),
    )
    expectInvalid(() => toArrivalPage({ data: [], nextCursor: 3 }))
    expectInvalid(() => toArrivalPage({ items: [], nextCursor: null }))
  })

  test('data e prazo ausentes (null) são aceitos onde a API devolve null', () => {
    const page = toArrivalPage({
      data: [
        buildSummary({
          deliveryDeadlineBusinessDays: null,
          palletCount: null,
          reference: null,
          separationDueAt: null,
          separationWindowHours: null,
        }),
      ],
      nextCursor: null,
    })

    expect(page.items[0]?.separationDueAt).toBeNull()
  })
})

describe('o detalhe da chegada', () => {
  test('aceita grupos com notas no formato real', () => {
    const detail = toArrivalDetail({ data: buildDetail() })

    expect(detail.groups.length).toBeGreaterThan(1)
    expect(detail.groups[0]?.documents[0]?.number).toBe('1001')
  })

  test('recusa chave a mais na chegada, no grupo e na nota', () => {
    const detail = buildDetail()
    expectInvalid(() => toArrivalDetail({ data: { ...detail, token: 'x' } }))
    expectInvalid(() =>
      toArrivalDetail({ data: { ...detail, groups: [{ ...detail.groups[0], extra: 1 }] } }),
    )
    const [group] = detail.groups
    expectInvalid(() =>
      toArrivalDetail({
        data: {
          ...detail,
          groups: [{ ...group, documents: [{ ...group?.documents[0], xml: '<nfe/>' }] }],
        },
      }),
    )
  })

  test('recusa estado de nota desconhecido e grupo sem a lista de notas', () => {
    const detail = buildDetail()
    const [group] = detail.groups
    expectInvalid(() =>
      toArrivalDetail({
        data: {
          ...detail,
          groups: [{ ...group, documents: [{ ...group?.documents[0], separationState: 'loaded' }] }],
        },
      }),
    )
    expectInvalid(() => toArrivalDetail({ data: { ...detail, groups: 'x' } }))
    expectInvalid(() => toArrivalDetail({}))
  })

  test('o registro devolve a chegada e diz se foi repetição', () => {
    expect(toRegisterResult({ data: buildDetail() }, 201).isReplay).toBe(false)
    expect(toRegisterResult({ data: buildDetail() }, 200).isReplay).toBe(true)
  })
})

describe('as notas disponíveis', () => {
  test('aceita o formato real, com cidade e UF nulas', () => {
    const page = toAvailableDocumentPage({
      data: [buildAvailable(1), buildAvailable(2, { cityIbgeCode: null, cityName: null, state: null })],
      nextCursor: null,
    })

    expect(page.items).toHaveLength(2)
  })

  test('recusa chave a mais ou valor que não é texto', () => {
    expectInvalid(() =>
      toAvailableDocumentPage({ data: [{ ...buildAvailable(1), weightKg: '10' }], nextCursor: null }),
    )
    expectInvalid(() =>
      toAvailableDocumentPage({ data: [{ ...buildAvailable(1), totalValue: 10 }], nextCursor: null }),
    )
  })
})

describe('o resultado do lote e do fechamento', () => {
  test('aceita um resultado por nota, recusada com motivo', () => {
    const outcomes = toBatchOutcomes({
      data: {
        results: [
          { documentId: 'a', outcome: 'changed' },
          { documentId: 'b', outcome: 'unchanged' },
          { documentId: 'c', outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' },
        ],
      },
    })

    expect(outcomes).toHaveLength(3)
  })

  test('recusa resultado sem motivo na recusada, com motivo na alterada ou de outro tipo', () => {
    expectInvalid(() => toBatchOutcomes({ data: { results: [{ documentId: 'a', outcome: 'refused' }] } }))
    expectInvalid(() =>
      toBatchOutcomes({ data: { results: [{ documentId: 'a', outcome: 'changed', reason: 'x' }] } }),
    )
    expectInvalid(() => toBatchOutcomes({ data: { results: [{ documentId: 'a', outcome: 'lost' }] } }))
    expectInvalid(() => toBatchOutcomes({ data: { results: 'x' } }))
  })

  test('o fechamento devolve a chegada e se mudou', () => {
    expect(toCloseResult({ data: { arrivalId: 'x', outcome: 'changed' } })).toEqual({
      arrivalId: 'x',
      outcome: 'changed',
    })
    expectInvalid(() => toCloseResult({ data: { arrivalId: 'x', outcome: 'ok' } }))
  })
})
