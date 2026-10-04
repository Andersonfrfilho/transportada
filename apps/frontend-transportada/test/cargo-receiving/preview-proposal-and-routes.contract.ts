/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (RF5b): as rotas de `/recebimento/previas`, a proposta de chegada (quando há o que propor),
 * o pré-preenchimento que a leva à tela de registro — SEM data nem hora, que o operador confirma — e o
 * repolling que só existe enquanto a prévia está na fila ou sendo lida.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCargoPreviewDetailRoute,
  buildCargoPreviewListRoute,
  parseCargoReceivingRoute,
} from '@/modules/cargo-receiving/shared/cargoReceivingRoute.service'
import { resolveCargoPreviewRefetchInterval } from '@/modules/cargo-receiving/shared/cargoPreviewPolling.service'
import {
  buildCargoArrivalPrefill,
  describeCargoPreviewProposal,
  readCargoArrivalPrefill,
  resolveProposalAvailability,
} from '@/modules/cargo-receiving/shared/cargoPreviewProposal.service'

import { ALFA_ID, documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { PREVIEW_ID } from '../fixtures/cargoPreview.fixture'

const PROPOSAL = {
  contractorId: ALFA_ID,
  documentIds: [documentIdOf(52_001), documentIdOf(52_006)],
  plannedDate: '2026-10-05',
  previewId: PREVIEW_ID,
  refused: [
    { documentId: documentIdOf(52_007), reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
    { documentId: documentIdOf(52_008), reason: 'DOCUMENT_IN_LIVE_TRIP' },
  ],
} as const

describe('as rotas das prévias', () => {
  test('a lista e o detalhe se montam e se leem de volta', () => {
    expect(buildCargoPreviewListRoute()).toBe('/recebimento/previas')
    expect(buildCargoPreviewDetailRoute(PREVIEW_ID)).toBe(`/recebimento/previas/${PREVIEW_ID}`)

    expect(parseCargoReceivingRoute('/recebimento/previas')).toEqual({ kind: 'previews' })
    expect(parseCargoReceivingRoute('/recebimento/previas/')).toEqual({ kind: 'previews' })
    expect(parseCargoReceivingRoute(`/recebimento/previas/${PREVIEW_ID}`)).toEqual({
      kind: 'preview-detail',
      previewId: PREVIEW_ID,
    })
  })

  test('id que não é UUID e subcaminho desconhecido caem na lista de prévias, nunca quebram', () => {
    expect(parseCargoReceivingRoute('/recebimento/previas/nao-e-uuid')).toEqual({
      kind: 'previews',
    })
    expect(parseCargoReceivingRoute(`/recebimento/previas/${PREVIEW_ID}/x`)).toEqual({
      kind: 'previews',
    })
  })

  test('as rotas da Fase 2 continuam as mesmas', () => {
    expect(parseCargoReceivingRoute('/recebimento')).toEqual({ kind: 'list' })
    expect(parseCargoReceivingRoute('/recebimento/nova')).toEqual({ kind: 'register' })
  })
})

describe('o repolling da prévia', () => {
  test('repete enquanto alguma prévia está na fila ou sendo lida', () => {
    expect(resolveCargoPreviewRefetchInterval(['ready', 'queued'])).toBe(3_000)
    expect(resolveCargoPreviewRefetchInterval(['processing'])).toBe(3_000)
  })

  test('para sozinho quando tudo assentou, falhando ou não, e sem prévia nenhuma', () => {
    expect(resolveCargoPreviewRefetchInterval(['ready', 'failed'])).toBe(false)
    expect(resolveCargoPreviewRefetchInterval([])).toBe(false)
  })
})

describe('quando a prévia pode propor a chegada', () => {
  const availability = (
    status: Parameters<typeof resolveProposalAvailability>[0]['status'],
    matched: number,
  ) => resolveProposalAvailability({ matchedCount: matched, status })

  test('lida e com nota vinculada propõe; sem nota vinculada explica; ainda na fila espera', () => {
    expect(availability('ready', 2)).toBe('available')
    expect(availability('ready', 0)).toBe('no-matched')
    expect(availability('queued', 0)).toBe('not-ready')
    expect(availability('processing', 3)).toBe('not-ready')
    expect(availability('failed', 3)).toBe('not-ready')
  })
})

describe('o rascunho da chegada', () => {
  test('conta o que entra e diz o motivo de cada nota que ficou de fora, com o número quando se sabe', () => {
    const view = describeCargoPreviewProposal({
      numbersByDocumentId: new Map([[documentIdOf(52_007), '52007']]),
      proposal: PROPOSAL,
    })

    expect(view.enteringCount).toBe(2)
    expect(view.canRegister).toBe(true)
    expect(view.refused).toEqual([
      { documentId: documentIdOf(52_007), number: '52007', reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
      { documentId: documentIdOf(52_008), number: undefined, reason: 'DOCUMENT_IN_LIVE_TRIP' },
    ])
  })

  test('sem nota que entre não há o que registrar', () => {
    const view = describeCargoPreviewProposal({
      numbersByDocumentId: new Map(),
      proposal: { ...PROPOSAL, documentIds: [] },
    })

    expect(view.canRegister).toBe(false)
    expect(view.enteringCount).toBe(0)
  })
})

describe('o pré-preenchimento da chegada', () => {
  test('leva contratante, notas, a prévia e o dia planejado — e NENHUMA data ou hora de chegada', () => {
    const prefill = buildCargoArrivalPrefill(PROPOSAL)

    expect(prefill).toEqual({
      contractorId: ALFA_ID,
      documentIds: PROPOSAL.documentIds,
      plannedDate: '2026-10-05',
      previewId: PREVIEW_ID,
    })
    expect(
      Object.keys(prefill).some((key) =>
        /date|time|arrived/iu.test(key.replace('plannedDate', '')),
      ),
    ).toBe(false)
  })

  test('lê o recado do histórico e recusa tudo o que não tem o formato exato', () => {
    const valid = buildCargoArrivalPrefill(PROPOSAL)

    expect(readCargoArrivalPrefill({ cargoArrivalPrefill: valid })).toEqual(valid)
    expect(readCargoArrivalPrefill({})).toBeUndefined()
    expect(readCargoArrivalPrefill(null)).toBeUndefined()
    expect(
      readCargoArrivalPrefill({ cargoArrivalPrefill: { ...valid, arrivedAt: 'x' } }),
    ).toBeUndefined()
    expect(
      readCargoArrivalPrefill({ cargoArrivalPrefill: { ...valid, documentIds: [1] } }),
    ).toBeUndefined()
    expect(
      readCargoArrivalPrefill({ cargoArrivalPrefill: { ...valid, contractorId: 7 } }),
    ).toBeUndefined()
  })
})
