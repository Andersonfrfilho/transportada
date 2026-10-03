/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): a máquina do toque do separador — o próximo estado da nota, o lote do grupo
 * que passa por `received` antes de `separated`, a recusa por nota sem derrubar o lote e a atualização
 * otimista que sabe voltar. Tudo puro: o envio entra por parâmetro.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyDocumentStates,
  planGroupSeparation,
  planOptimisticStates,
  readDocumentStates,
  resolveNextTouchTarget,
  runGroupSeparation,
  runSingleTouch,
  type TouchSender,
} from '@/modules/cargo-receiving/shared/cargoSeparationTouch.service'
import type { CargoDocumentOutcome } from '@/modules/cargo-receiving/shared/cargoArrival.types'

import { buildDetail, buildDocument, documentIdOf } from '../fixtures/cargoReceiving.fixture'

type SentBatch = { documentIds: readonly string[]; to: string }

/** Um envio dublado: registra a ordem das chamadas e responde `changed`, salvo nota recusada. */
function recordingSender(refusals: Readonly<Record<string, string>> = {}) {
  const batches: SentBatch[] = []
  const send: TouchSender = (request) => {
    batches.push({ documentIds: [...request.documentIds], to: request.to })
    const results: CargoDocumentOutcome[] = request.documentIds.map((documentId) => {
      const reason = refusals[`${request.to}:${documentId}`]
      return reason === undefined
        ? { documentId, outcome: 'changed' }
        : { documentId, outcome: 'refused', reason }
    })
    return Promise.resolve(results)
  }
  return { batches, send }
}

const EXPECTED = buildDocument({ number: '2001' })
const RECEIVED = buildDocument({ number: '2002', separationState: 'received' })
const SEPARATED = buildDocument({ number: '2003', separationState: 'separated' })
const EXPECTED_TOO = buildDocument({ number: '2004' })

describe('o próximo passo do toque (spec 237 T2.4)', () => {
  test.each([
    ['expected', 'received'],
    ['received', 'separated'],
    ['separated', undefined],
  ] as const)('de %s o toque vai para %s', (state, expected) => {
    expect(resolveNextTouchTarget(state)).toBe(expected)
  })
})

describe('o plano do grupo passa por received antes de separated', () => {
  test('esperada entra nos dois passos, recebida só no segundo, separada fica fora', () => {
    const plan = planGroupSeparation([EXPECTED, RECEIVED, SEPARATED, EXPECTED_TOO])

    expect(plan.receiveIds).toEqual([EXPECTED.nfeDocumentId, EXPECTED_TOO.nfeDocumentId])
    expect(plan.separateIds).toEqual([
      EXPECTED.nfeDocumentId,
      RECEIVED.nfeDocumentId,
      EXPECTED_TOO.nfeDocumentId,
    ])
  })

  test('grupo todo separado não tem passo nenhum', () => {
    expect(planGroupSeparation([SEPARATED])).toEqual({ receiveIds: [], separateIds: [] })
  })

  test('o alvo otimista do grupo é separada para tudo que ainda não está', () => {
    expect(planOptimisticStates([EXPECTED, RECEIVED, SEPARATED])).toEqual({
      [EXPECTED.nfeDocumentId]: 'separated',
      [RECEIVED.nfeDocumentId]: 'separated',
    })
  })
})

describe('um toque numa nota', () => {
  test('envia um lote só, com o próximo estado, e devolve o estado novo', async () => {
    const { batches, send } = recordingSender()

    const run = await runSingleTouch({ document: EXPECTED, send })

    expect(batches).toEqual([{ documentIds: [EXPECTED.nfeDocumentId], to: 'received' }])
    expect(run.states).toEqual({ [EXPECTED.nfeDocumentId]: 'received' })
    expect(run.results).toEqual([{ documentId: EXPECTED.nfeDocumentId, outcome: 'changed' }])
  })

  test('recusada volta ao estado anterior e a razão chega à tela', async () => {
    const { send } = recordingSender({
      [`separated:${RECEIVED.nfeDocumentId}`]: 'CARGO_ARRIVAL_CLOSED',
    })

    const run = await runSingleTouch({ document: RECEIVED, send })

    expect(run.states).toEqual({ [RECEIVED.nfeDocumentId]: 'received' })
    expect(run.results).toEqual([
      { documentId: RECEIVED.nfeDocumentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' },
    ])
  })

  test('nota já separada não envia nada', async () => {
    const { batches, send } = recordingSender()

    const run = await runSingleTouch({ document: SEPARATED, send })

    expect(batches).toEqual([])
    expect(run.results).toEqual([])
  })
})

describe('separar tudo do grupo', () => {
  test('recebe só as esperadas e depois separa todas, nessa ordem', async () => {
    const { batches, send } = recordingSender()

    const run = await runGroupSeparation({
      documents: [EXPECTED, RECEIVED, SEPARATED, EXPECTED_TOO],
      send,
    })

    expect(batches).toEqual([
      { documentIds: [EXPECTED.nfeDocumentId, EXPECTED_TOO.nfeDocumentId], to: 'received' },
      {
        documentIds: [EXPECTED.nfeDocumentId, RECEIVED.nfeDocumentId, EXPECTED_TOO.nfeDocumentId],
        to: 'separated',
      },
    ])
    expect(run.states).toEqual({
      [EXPECTED.nfeDocumentId]: 'separated',
      [EXPECTED_TOO.nfeDocumentId]: 'separated',
      [RECEIVED.nfeDocumentId]: 'separated',
    })
  })

  test('sem nota esperada não há passo de recebimento', async () => {
    const { batches, send } = recordingSender()

    await runGroupSeparation({ documents: [RECEIVED, SEPARATED], send })

    expect(batches).toEqual([{ documentIds: [RECEIVED.nfeDocumentId], to: 'separated' }])
  })

  test('grupo todo separado não envia nada', async () => {
    const { batches, send } = recordingSender()

    const run = await runGroupSeparation({ documents: [SEPARATED], send })

    expect(batches).toEqual([])
    expect(run.results).toEqual([])
  })

  test('a nota recusada no recebimento não entra no passo de separar e as outras seguem', async () => {
    const { batches, send } = recordingSender({
      [`received:${EXPECTED.nfeDocumentId}`]: 'CARGO_ARRIVAL_CLOSED',
    })

    const run = await runGroupSeparation({ documents: [EXPECTED, EXPECTED_TOO, RECEIVED], send })

    expect(batches[1]).toEqual({
      documentIds: [EXPECTED_TOO.nfeDocumentId, RECEIVED.nfeDocumentId],
      to: 'separated',
    })
    expect(run.states).toEqual({
      [EXPECTED.nfeDocumentId]: 'expected',
      [EXPECTED_TOO.nfeDocumentId]: 'separated',
      [RECEIVED.nfeDocumentId]: 'separated',
    })
    expect(run.results).toContainEqual({
      documentId: EXPECTED.nfeDocumentId,
      outcome: 'refused',
      reason: 'CARGO_ARRIVAL_CLOSED',
    })
    expect(run.results.filter((result) => result.outcome === 'refused')).toHaveLength(1)
  })

  test('recusada no passo de separar fica recebida, que é onde ela de fato parou', async () => {
    const { send } = recordingSender({
      [`separated:${EXPECTED.nfeDocumentId}`]: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED',
    })

    const run = await runGroupSeparation({ documents: [EXPECTED, RECEIVED], send })

    expect(run.states).toEqual({
      [EXPECTED.nfeDocumentId]: 'received',
      [RECEIVED.nfeDocumentId]: 'separated',
    })
    expect(run.results).toContainEqual({
      documentId: EXPECTED.nfeDocumentId,
      outcome: 'refused',
      reason: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED',
    })
  })

  test('um resultado por nota, no fim: alterada se algum passo mudou', async () => {
    const { send } = recordingSender()

    const run = await runGroupSeparation({ documents: [EXPECTED, RECEIVED], send })

    expect(run.results).toEqual([
      { documentId: EXPECTED.nfeDocumentId, outcome: 'changed' },
      { documentId: RECEIVED.nfeDocumentId, outcome: 'changed' },
    ])
  })
})

describe('a atualização otimista e a volta', () => {
  const detail = buildDetail({
    documents: [
      buildDocument({ number: '3001' }),
      buildDocument({ number: '3002', separationState: 'received' }),
      buildDocument({ cityIbgeCode: '3526902', cityName: 'Limeira', number: '3003' }),
    ],
  })

  test('troca o estado das notas e recalcula as contagens do grupo e da chegada', () => {
    const next = applyDocumentStates({
      detail,
      states: { [documentIdOf(3001)]: 'separated' },
    })

    expect(next.groups[0]?.counts).toEqual({ expected: 0, received: 1, separated: 1, total: 2 })
    expect(next.groups[1]?.counts).toEqual({ expected: 1, received: 0, separated: 0, total: 1 })
    expect(next.counts).toEqual({ expected: 1, received: 1, separated: 1, total: 3 })
  })

  test('não muda a chegada original e mantém a ordem dos grupos e das notas', () => {
    const before = JSON.stringify(detail)

    const next = applyDocumentStates({ detail, states: { [documentIdOf(3002)]: 'separated' } })

    expect(JSON.stringify(detail)).toBe(before)
    expect(next.groups.map((group) => group.documents.map((item) => item.number))).toEqual([
      ['3001', '3002'],
      ['3003'],
    ])
  })

  test('ler os estados antes e reaplicar devolve exatamente a chegada de antes', () => {
    const ids = [documentIdOf(3001), documentIdOf(3003)]
    const previous = readDocumentStates({ detail, documentIds: ids })
    const optimistic = applyDocumentStates({
      detail,
      states: { [ids[0] ?? '']: 'separated', [ids[1] ?? '']: 'separated' },
    })

    expect(applyDocumentStates({ detail: optimistic, states: previous })).toEqual(detail)
  })

  test('nota que não está na chegada é ignorada na leitura', () => {
    expect(readDocumentStates({ detail, documentIds: [documentIdOf(9999)] })).toEqual({})
  })
})
