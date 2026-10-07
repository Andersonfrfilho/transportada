/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: as guardas de resposta da prévia conferem as chaves EXATAS, em cada nível, no formato
 * real de `cargo-preview.types.ts` da API (`security.md` §3: resposta de API é entrada não confiável).
 * Chave a mais, a menos ou valor fora da lista recusa a resposta inteira.
 */
import { describe, expect, test } from 'bun:test'

import {
  toPreviewDetail,
  toPreviewPage,
  toProposal,
} from '@/modules/cargo-receiving/shared/cargoPreviewResponse.validation'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  buildPreviewDetail,
  buildPreviewItem,
  buildPreviewSummary,
  PREVIEW_ID,
} from '../fixtures/cargoPreview.fixture'

function isInvalid(call: () => unknown): boolean {
  try {
    call()
    return false
  } catch (error) {
    return error instanceof CargoReceivingRequestError && error.message === 'RESPONSE_INVALID'
  }
}

describe('a lista de prévias', () => {
  test('aceita o formato real e devolve o cursor', () => {
    const page = toPreviewPage({ data: [buildPreviewSummary()], nextCursor: null })

    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
  })

  test('recusa chave a mais, chave a menos e situação desconhecida', () => {
    const summary = buildPreviewSummary()
    const withoutFileName = Object.fromEntries(
      Object.entries(summary).filter(([key]) => key !== 'fileName'),
    )

    expect(
      isInvalid(() => toPreviewPage({ data: [{ ...summary, extra: 1 }], nextCursor: null })),
    ).toBe(true)
    expect(isInvalid(() => toPreviewPage({ data: [withoutFileName], nextCursor: null }))).toBe(true)
    expect(
      isInvalid(() => toPreviewPage({ data: [{ ...summary, status: 'done' }], nextCursor: null })),
    ).toBe(true)
    expect(isInvalid(() => toPreviewPage({ data: [summary], nextCursor: 7 }))).toBe(true)
    expect(isInvalid(() => toPreviewPage({ nextCursor: null }))).toBe(true)
  })

  test('aceita os valores nulos que a API devolve numa prévia que ainda não foi lida', () => {
    const queued = buildPreviewSummary({
      contractorName: null,
      plannedDate: null,
      rowCount: null,
      sheetName: null,
      status: 'queued',
    })

    expect(toPreviewPage({ data: [queued], nextCursor: null }).items[0]?.rowCount).toBeNull()
  })
})

describe('o detalhe da prévia', () => {
  test('aceita o formato real, com contagens, roteiros e itens', () => {
    const detail = toPreviewDetail({ data: buildPreviewDetail() })

    expect(detail.counts.total).toBe(7)
    expect(detail.routes.map((route) => route.routeName)).toEqual(['FR.R.LIM', 'FR.S.CAR'])
    expect(detail.items.items[0]?.document?.number).toBe('52001')
  })

  test('recusa contagem sem uma das cinco situações ou sem o total', () => {
    const detail = buildPreviewDetail()
    const partialCounts = Object.fromEntries(
      Object.entries(detail.counts).filter(([key]) => key !== 'ambiguous'),
    )

    expect(isInvalid(() => toPreviewDetail({ data: { ...detail, counts: partialCounts } }))).toBe(
      true,
    )
    expect(
      isInvalid(() =>
        toPreviewDetail({ data: { ...detail, counts: { ...detail.counts, total: 'x' } } }),
      ),
    ).toBe(true)
  })

  test('recusa item com chave a mais, situação desconhecida ou nota vinculada malformada', () => {
    const detail = buildPreviewDetail()
    const withItem = (item: unknown) => ({
      data: { ...detail, items: { items: [item], nextCursor: null } },
    })
    const item = buildPreviewItem(1)

    expect(isInvalid(() => toPreviewDetail(withItem({ ...item, cpf: '1' })))).toBe(true)
    expect(isInvalid(() => toPreviewDetail(withItem({ ...item, matchState: 'done' })))).toBe(true)
    expect(
      isInvalid(() => toPreviewDetail(withItem({ ...item, document: { id: 'x', number: '1' } }))),
    ).toBe(true)
    expect(isInvalid(() => toPreviewDetail(withItem({ ...item, rowNumber: '5' })))).toBe(true)
  })

  test('o erro de linha é lido pelas três chaves que o leitor grava', () => {
    const invalid = buildPreviewItem(5, {
      matchState: 'invalid',
      rowErrors: [{ column: 'VALOR', field: 'value', message: 'A value is required' }],
    })

    const detail = toPreviewDetail({ data: buildPreviewDetail({ items: [invalid] }) })

    expect(detail.items.items[0]?.rowErrors).toEqual([
      { column: 'VALOR', field: 'value', message: 'A value is required' },
    ])
    expect(
      isInvalid(() =>
        toPreviewDetail({
          data: buildPreviewDetail({
            items: [{ ...invalid, rowErrors: [{ column: 'VALOR' }] as never }],
          }),
        }),
      ),
    ).toBe(true)
  })

  test('a origem da carga ligada só aceita os valores da API', () => {
    const detail = buildPreviewDetail()
    const [route] = detail.routes

    expect(
      isInvalid(() =>
        toPreviewDetail({ data: { ...detail, routes: [{ ...route, loadOrigin: 'chute' }] } }),
      ),
    ).toBe(true)
  })
})

describe('a proposta de chegada', () => {
  const proposal = {
    contractorId: '00000000-0000-4000-8000-000000237a01',
    documentIds: [documentIdOf(52_001)],
    plannedDate: null,
    previewId: PREVIEW_ID,
    refused: [{ documentId: documentIdOf(52_006), reason: 'DOCUMENT_IN_LIVE_TRIP' }],
  }

  test('aceita o formato real, com o dia planejado nulo', () => {
    expect(toProposal({ data: proposal })).toEqual(proposal)
  })

  test('recusa chave a mais e recusada sem motivo', () => {
    expect(isInvalid(() => toProposal({ data: { ...proposal, extra: true } }))).toBe(true)
    expect(
      isInvalid(() => toProposal({ data: { ...proposal, refused: [{ documentId: 'x' }] } })),
    ).toBe(true)
  })
})
