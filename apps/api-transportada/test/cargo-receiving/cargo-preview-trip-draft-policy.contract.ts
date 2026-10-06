/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 (RF7): os rascunhos de viagem de uma prévia — um por roteiro do contratante. Só a nota
 * VINCULADA (`matched`) entra; `suggested` espera o operador. Nota em viagem viva fica marcada e fora
 * dos ids roteáveis. Sem I/O: a política recebe as linhas que o repositório trouxe.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCargoPreviewTripDrafts,
  isCargoPreviewDocumentRoutable,
} from '../../src/cargo-receiving/domain/cargo-preview-trip-draft.policy.js'
import type {
  TripDraftDocumentRow,
  TripDraftItemRow,
  TripDraftRouteLoadRow,
} from '../../src/cargo-receiving/domain/cargo-preview-trip-draft.types.js'

const PREVIEW = {
  contractorId: 'contractor-1',
  id: 'preview-1',
  plannedDate: '2026-10-05',
  status: 'ready',
} as const

function item(overrides: Partial<TripDraftItemRow> & { readonly rowNumber: number }) {
  return {
    city: 'SAO CARLOS',
    matchState: 'awaiting_xml',
    matchedDocumentId: null,
    routeName: 'FR.S.CAR',
    state: 'SP',
    value: '100.00',
    volumeM3: null,
    weightKg: '10.000',
    ...overrides,
  } satisfies TripDraftItemRow
}

function document(overrides: Partial<TripDraftDocumentRow> & { readonly id: string }) {
  return {
    cityIbgeCode: '3548906',
    cityName: 'São Carlos',
    grossWeightKg: '10.000',
    isInLiveTrip: false,
    number: '100',
    recipientName: 'Destinatário Fictício',
    series: '1',
    state: 'SP',
    status: 'authorized',
    totalValue: '100.0000',
    ...overrides,
  } satisfies TripDraftDocumentRow
}

type BuildInput = {
  readonly documents?: readonly TripDraftDocumentRow[]
  readonly excludedDocumentIds?: ReadonlySet<string>
  readonly items: readonly TripDraftItemRow[]
  readonly routeLoads?: readonly TripDraftRouteLoadRow[]
}

function build(input: BuildInput) {
  return buildCargoPreviewTripDrafts({
    documents: input.documents ?? [],
    excludedDocumentIds: input.excludedDocumentIds ?? new Set(),
    items: input.items,
    preview: PREVIEW,
    routeLoads: input.routeLoads ?? [],
  })
}

const MATCHED = 'matched'

describe('os rascunhos de viagem da prévia (spec 237 T5.1)', () => {
  test('um rascunho por roteiro, na ordem do nome, e o "sem roteiro" por último', () => {
    const drafts = build({
      items: [
        item({ rowNumber: 1, routeName: 'FR.R.PRE' }),
        item({ rowNumber: 2, routeName: null, matchState: 'invalid', value: null, weightKg: null }),
        item({ rowNumber: 3, routeName: 'FR.FRANC' }),
        item({ rowNumber: 4, routeName: 'FR.S.CAR' }),
      ],
    })

    expect(drafts.routes.map((route) => route.routeName)).toEqual([
      'FR.FRANC',
      'FR.R.PRE',
      'FR.S.CAR',
      null,
    ])
    expect(drafts.summary.routeCount).toBe(3)
    expect(drafts.plannedDate).toBe('2026-10-05')
    expect(drafts.routes.every((route) => route.plannedDate === '2026-10-05')).toBe(true)
  })

  test('as contagens por estado são do roteiro, e o total de cada um fecha com o do resumo', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 }),
        item({ rowNumber: 2 }),
        item({ matchState: 'suggested', rowNumber: 3 }),
        item({ matchState: 'ambiguous', rowNumber: 4 }),
        item({ routeName: 'FR.OUTRO', rowNumber: 5 }),
      ],
    })

    const route = drafts.routes.find((entry) => entry.routeName === 'FR.S.CAR')
    expect(route?.counts).toEqual({
      ambiguous: 1,
      awaiting_xml: 1,
      invalid: 0,
      matched: 1,
      suggested: 1,
      total: 4,
    })
    expect(drafts.summary.counts).toEqual({
      ambiguous: 1,
      awaiting_xml: 2,
      invalid: 0,
      matched: 1,
      suggested: 1,
      total: 5,
    })
  })

  test('"faltam" é só a linha esperando o XML: sugerida e ambígua não são "faltando"', () => {
    const drafts = build({
      items: [
        item({ rowNumber: 1 }),
        item({ rowNumber: 2 }),
        item({ matchState: 'suggested', rowNumber: 3 }),
        item({ matchState: 'ambiguous', rowNumber: 4 }),
      ],
    })

    expect(drafts.routes[0]?.missingCount).toBe(2)
    expect(drafts.summary.missingCount).toBe(2)
  })

  test('só a nota vinculada (`matched`) é nota do rascunho: a sugerida nunca entra', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' }), document({ id: 'doc-sugerida', number: '200' })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 }),
        item({ matchState: 'suggested', matchedDocumentId: null, rowNumber: 2 }),
      ],
    })

    expect(drafts.routes[0]?.documents.map((entry) => entry.documentId)).toEqual(['doc-a'])
    expect(drafts.routableDocumentIds).toEqual(['doc-a'])
    expect(drafts.summary.linkedDocumentCount).toBe(1)
  })

  test('o estado manda, não a coluna: a linha sugerida com id de nota gravado também não vincula', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [item({ matchState: 'suggested', matchedDocumentId: 'doc-a', rowNumber: 1 })],
    })

    expect(drafts.routes[0]?.documents).toEqual([])
    expect(drafts.routableDocumentIds).toEqual([])
    expect(drafts.summary.linkedDocumentCount).toBe(0)
  })

  test('quantas linhas da planilha fecham cada nota (n linhas ↔ 1 nota)', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 2 }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 3 }),
      ],
    })

    expect(drafts.routes[0]?.documents).toHaveLength(1)
    expect(drafts.routes[0]?.documents[0]?.lineCount).toBe(3)
    expect(drafts.routableDocumentIds).toEqual(['doc-a'])
  })

  test('nota em viagem viva aparece marcada e fica FORA dos ids roteáveis', () => {
    const drafts = build({
      documents: [
        document({ id: 'doc-livre', number: '100' }),
        document({ id: 'doc-viva', isInLiveTrip: true, number: '101' }),
      ],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-livre', rowNumber: 1 }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-viva', rowNumber: 2 }),
      ],
    })

    const [route] = drafts.routes
    expect(route?.documents.map((entry) => [entry.documentId, entry.isInLiveTrip])).toEqual([
      ['doc-livre', false],
      ['doc-viva', true],
    ])
    expect(route?.routableDocumentIds).toEqual(['doc-livre'])
    expect(drafts.routableDocumentIds).toEqual(['doc-livre'])
    expect(drafts.summary.inLiveTripDocumentCount).toBe(1)
    expect(drafts.summary.routableDocumentCount).toBe(1)
  })

  test('nota que não está autorizada também não é roteável: o roteirizador a recusaria', () => {
    const drafts = build({
      documents: [document({ id: 'doc-cancelada', status: 'cancelled' })],
      items: [item({ matchState: MATCHED, matchedDocumentId: 'doc-cancelada', rowNumber: 1 })],
    })

    expect(drafts.routableDocumentIds).toEqual([])
    expect(drafts.routes[0]?.documents[0]?.isRoutable).toBe(false)
    expect(drafts.routes[0]?.documents[0]?.isInLiveTrip).toBe(false)
  })

  test('o gancho da RF8a: a nota excluída por outra regra sai dos roteáveis, num lugar só', () => {
    const live = document({ id: 'doc-a', isInLiveTrip: true })
    const free = document({ id: 'doc-b' })
    expect(isCargoPreviewDocumentRoutable({ document: free, excludedDocumentIds: new Set() })).toBe(
      true,
    )
    expect(
      isCargoPreviewDocumentRoutable({ document: free, excludedDocumentIds: new Set(['doc-b']) }),
    ).toBe(false)
    expect(isCargoPreviewDocumentRoutable({ document: live, excludedDocumentIds: new Set() })).toBe(
      false,
    )

    const drafts = build({
      documents: [free],
      excludedDocumentIds: new Set(['doc-b']),
      items: [item({ matchState: MATCHED, matchedDocumentId: 'doc-b', rowNumber: 1 })],
    })
    expect(drafts.routableDocumentIds).toEqual([])
    expect(drafts.routes[0]?.canPropose).toBe(false)
  })

  test('`canPropose` exige ao menos uma nota vinculada e utilizável, e diz o motivo quando não há', () => {
    const drafts = build({
      documents: [document({ id: 'doc-viva', isInLiveTrip: true })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-viva', rowNumber: 1, routeName: 'A' }),
        item({ rowNumber: 2, routeName: 'B' }),
        item({ matchState: 'suggested', rowNumber: 3, routeName: 'C' }),
      ],
    })

    const byName = new Map(drafts.routes.map((route) => [route.routeName, route]))
    expect(byName.get('A')?.canPropose).toBe(false)
    expect(byName.get('A')?.cannotProposeReason).toBe('none_routable')
    expect(byName.get('B')?.canPropose).toBe(false)
    expect(byName.get('B')?.cannotProposeReason).toBe('no_linked_documents')
    expect(byName.get('C')?.cannotProposeReason).toBe('no_linked_documents')
    expect(drafts.summary.canPropose).toBe(false)
  })

  test('a prévia sem nenhum vínculo: todos os rascunhos com `canPropose=false`', () => {
    const drafts = build({
      items: [
        item({ rowNumber: 1, routeName: 'A' }),
        item({ rowNumber: 2, routeName: 'B' }),
        item({ rowNumber: 3, routeName: 'B' }),
      ],
    })

    expect(drafts.routes.map((route) => route.canPropose)).toEqual([false, false])
    expect(drafts.routableDocumentIds).toEqual([])
    expect(drafts.summary.canPropose).toBe(false)
    expect(
      drafts.routes.every((route) => route.cannotProposeReason === 'no_linked_documents'),
    ).toBe(true)
  })

  test('com nota utilizável o rascunho propõe, sem motivo de recusa', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 })],
    })

    expect(drafts.routes[0]?.canPropose).toBe(true)
    expect(drafts.routes[0]?.cannotProposeReason).toBeNull()
    expect(drafts.summary.canPropose).toBe(true)
  })

  test('as cidades juntam a nota vinculada e a linha que espera, sem acento nem caixa', () => {
    const drafts = build({
      documents: [
        document({ id: 'doc-a', number: '100' }),
        document({ id: 'doc-b', number: '101' }),
        document({
          cityIbgeCode: '3503208',
          cityName: 'Araraquara',
          id: 'doc-c',
          number: '102',
        }),
      ],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-b', rowNumber: 2 }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-c', rowNumber: 3, city: 'ARARAQUARA' }),
        item({ city: 'SAO CARLOS', rowNumber: 4 }),
        item({ city: 'DESCALVADO', rowNumber: 5 }),
      ],
    })

    expect(drafts.routes[0]?.cities).toEqual([
      { cityIbgeCode: '3503208', cityName: 'Araraquara', documentCount: 1, pendingLineCount: 0 },
      { cityIbgeCode: null, cityName: 'DESCALVADO', documentCount: 0, pendingLineCount: 1 },
      { cityIbgeCode: '3548906', cityName: 'São Carlos', documentCount: 2, pendingLineCount: 1 },
    ])
  })

  test('a mesma cidade em outro estado não se mistura', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 }),
        item({ city: 'SAO CARLOS', rowNumber: 2, state: 'SC' }),
      ],
    })

    expect(
      drafts.routes[0]?.cities.map((city) => city.documentCount + city.pendingLineCount),
    ).toEqual([1, 1])
  })

  test('os totais do roteiro somam a planilha inteira; os da nota somam só as vinculadas, uma vez cada', () => {
    const drafts = build({
      documents: [
        document({ grossWeightKg: '25.500', id: 'doc-a', totalValue: '300.0000' }),
        document({ grossWeightKg: null, id: 'doc-b', number: '101', totalValue: '50.5000' }),
      ],
      items: [
        item({
          matchState: MATCHED,
          matchedDocumentId: 'doc-a',
          rowNumber: 1,
          value: '100.00',
          volumeM3: '0.2600',
          weightKg: '10.000',
        }),
        item({
          matchState: MATCHED,
          matchedDocumentId: 'doc-a',
          rowNumber: 2,
          value: '200.00',
          volumeM3: '0.1000',
          weightKg: '15.500',
        }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-b', rowNumber: 3, value: '50.50' }),
        item({ rowNumber: 4, value: '10.25', volumeM3: '0.0500', weightKg: '1.005' }),
      ],
    })

    const [route] = drafts.routes
    expect(route?.totals).toEqual({ value: '360.75', volumeM3: '0.4100', weightKg: '36.505' })
    expect(route?.linkedTotals).toEqual({ value: '350.5000', weightKg: '25.500' })
    expect(route?.documents[0]?.weightKg).toBe('25.500')
    expect(route?.documents[1]?.weightKg).toBeNull()
  })

  test('os totais de um roteiro não somam as linhas do outro', () => {
    const drafts = build({
      items: [
        item({ routeName: 'A', rowNumber: 1, value: '10.00', weightKg: '1.000' }),
        item({ routeName: 'B', rowNumber: 2, value: '200.00', weightKg: '20.000' }),
        item({ routeName: 'B', rowNumber: 3, value: '300.00', weightKg: '30.000' }),
      ],
    })

    expect(drafts.routes.map((route) => [route.totals.value, route.totals.weightKg])).toEqual([
      ['10.00', '1.000'],
      ['500.00', '50.000'],
    ])
  })

  test('sem volume em nenhuma linha, o volume do roteiro é nulo (e não zero)', () => {
    const drafts = build({ items: [item({ rowNumber: 1 })] })

    expect(drafts.routes[0]?.totals.volumeM3).toBeNull()
  })

  test('linha inválida não entra nos totais da planilha', () => {
    const drafts = build({
      items: [
        item({ rowNumber: 1, routeName: null, matchState: 'invalid', value: '9999.00' }),
        item({ rowNumber: 2, routeName: null, value: '5.00', weightKg: '1.000' }),
      ],
    })

    expect(drafts.routes[0]?.totals.value).toBe('5.00')
  })

  test('a carga ligada e a origem do par vêm do roteiro; sem par, nulos', () => {
    const drafts = build({
      items: [item({ routeName: 'FR.A', rowNumber: 1 }), item({ routeName: 'FR.B', rowNumber: 2 })],
      routeLoads: [{ loadReference: '123456', origin: 'totals', routeName: 'FR.A' }],
    })

    expect(drafts.routes.map((route) => [route.loadReference, route.loadOrigin])).toEqual([
      ['123456', 'totals'],
      [null, null],
    ])
  })

  test('a ordem é estável: roteiro, cidade, número da nota (numérico), id', () => {
    const documents = [
      document({ cityName: 'Zeta', id: 'd1', number: '9' }),
      document({ cityName: 'Alfa', id: 'd2', number: '100' }),
      document({ cityName: 'Alfa', id: 'd3', number: '20' }),
      document({ cityName: 'Alfa', id: 'd0', number: '20' }),
    ]
    const items = documents.map((entry, index) =>
      item({ matchState: MATCHED, matchedDocumentId: entry.id, rowNumber: index + 1 }),
    )

    const forward = build({ documents, items })
    const reversed = build({ documents: [...documents].reverse(), items: [...items].reverse() })

    expect(forward.routes[0]?.documents.map((entry) => entry.documentId)).toEqual([
      'd0',
      'd3',
      'd2',
      'd1',
    ])
    expect(forward.routableDocumentIds).toEqual(['d0', 'd3', 'd2', 'd1'])
    expect(reversed).toEqual(forward)
  })

  test('os ids roteáveis do resumo não repetem a nota de dois roteiros', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1, routeName: 'A' }),
        item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 2, routeName: 'B' }),
      ],
    })

    expect(drafts.routableDocumentIds).toEqual(['doc-a'])
    expect(drafts.summary.linkedDocumentCount).toBe(1)
  })

  test('prévia que não foi lida devolve a situação e nenhum rascunho', () => {
    const drafts = buildCargoPreviewTripDrafts({
      documents: [],
      excludedDocumentIds: new Set(),
      items: [],
      preview: { ...PREVIEW, status: 'processing' },
      routeLoads: [],
    })

    expect(drafts.status).toBe('processing')
    expect(drafts.routes).toEqual([])
    expect(drafts.summary.canPropose).toBe(false)
    expect(drafts.summary.counts.total).toBe(0)
  })

  test('as chaves são exatas: o painel confere uma a uma', () => {
    const drafts = build({
      documents: [document({ id: 'doc-a' })],
      items: [item({ matchState: MATCHED, matchedDocumentId: 'doc-a', rowNumber: 1 })],
    })

    expect(Object.keys(drafts).sort()).toEqual([
      'contractorId',
      'plannedDate',
      'previewId',
      'routableDocumentIds',
      'routes',
      'status',
      'summary',
    ])
    expect(Object.keys(drafts.summary).sort()).toEqual([
      'canPropose',
      'counts',
      'inLiveTripDocumentCount',
      'linkedDocumentCount',
      'missingCount',
      'routableDocumentCount',
      'routeCount',
    ])
    expect(Object.keys(drafts.routes[0] ?? {}).sort()).toEqual([
      'canPropose',
      'cannotProposeReason',
      'cities',
      'counts',
      'documents',
      'linkedTotals',
      'loadOrigin',
      'loadReference',
      'missingCount',
      'plannedDate',
      'routableDocumentIds',
      'routeName',
      'totals',
    ])
    expect(Object.keys(drafts.routes[0]?.documents[0] ?? {}).sort()).toEqual([
      'cityIbgeCode',
      'cityName',
      'documentId',
      'isInLiveTrip',
      'isRoutable',
      'lineCount',
      'number',
      'recipientName',
      'series',
      'status',
      'totalValue',
      'weightKg',
    ])
  })
})
