/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2 (RF7): o que os rascunhos mandam a cada fluxo. Ao FLUXO DE CRIAÇÃO DE VIAGEM vão só as notas
 * roteáveis do roteiro; ao ROTEIRIZADOR, só as roteáveis do escopo (todos os roteiros, ou o escolhido).
 * Nota em viagem viva, `suggested` e linha esperando o XML nunca viajam. Sem I/O.
 */
import { describe, expect, test } from 'bun:test'

import {
  describeTripDraftOutside,
  parseTripDraftView,
  resolveTripDraftAction,
  resolveTripDraftCreationIds,
  resolveTripDraftSolverScope,
  serializeTripDraftView,
} from '@/modules/cargo-receiving/shared/cargoPreviewTripDraftView.service'
import { CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT } from '@/modules/cargo-receiving/shared/cargoPreviewTripDraft.constant'

import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  buildCounts,
  buildDraftDocument,
  buildDraftRoute,
  buildTripDrafts,
  DEFAULT_TRIP_DRAFTS,
} from '../fixtures/cargoPreviewTripDraft.fixture'

const routeOf = (name: string | null) => {
  const found = DEFAULT_TRIP_DRAFTS.routes.find((route) => route.routeName === name)
  if (found === undefined) throw new Error(`ROUTE_NOT_FOUND:${String(name)}`)
  return found
}

describe('o que vai ao fluxo de criação de viagem', () => {
  test('só as notas roteáveis do roteiro — a que está em viagem viva fica de fora', () => {
    expect(resolveTripDraftCreationIds(routeOf('FR.S.CAR'))).toEqual([
      documentIdOf(53_001),
      documentIdOf(53_002),
    ])
    expect(resolveTripDraftCreationIds(routeOf('FR.S.CAR'))).not.toContain(documentIdOf(53_003))
  })

  test('roteiro sem nota roteável não manda nada', () => {
    expect(resolveTripDraftCreationIds(routeOf('FR.FRANC'))).toEqual([])
    expect(resolveTripDraftCreationIds(routeOf('FR.MATAO'))).toEqual([])
    expect(resolveTripDraftCreationIds(routeOf(null))).toEqual([])
  })
})

describe('o que vai ao roteirizador', () => {
  test('sem roteiro escolhido, todas as notas roteáveis de todos os roteiros', () => {
    const scope = resolveTripDraftSolverScope({
      drafts: DEFAULT_TRIP_DRAFTS,
      selectedRouteName: undefined,
    })

    expect(scope.documentIds).toEqual(DEFAULT_TRIP_DRAFTS.routableDocumentIds)
    expect(scope.documentIds).toHaveLength(4)
    expect(scope.routeName).toBeUndefined()
    expect(scope.isOverLimit).toBe(false)
  })

  test('com o roteiro escolhido, só as roteáveis dele', () => {
    const scope = resolveTripDraftSolverScope({
      drafts: DEFAULT_TRIP_DRAFTS,
      selectedRouteName: 'FR.R.PRE',
    })

    expect(scope.documentIds).toEqual([documentIdOf(53_020), documentIdOf(53_021)])
    expect(scope.routeName).toBe('FR.R.PRE')
  })

  test('roteiro escolhido que sumiu da prévia volta ao escopo de todos, sem quebrar', () => {
    const scope = resolveTripDraftSolverScope({
      drafts: DEFAULT_TRIP_DRAFTS,
      selectedRouteName: 'FR.NAO.EXISTE',
    })

    expect(scope.routeName).toBeUndefined()
    expect(scope.documentIds).toEqual(DEFAULT_TRIP_DRAFTS.routableDocumentIds)
  })

  test('acima do teto do roteirizador o escopo avisa, e o teto é o da API (500)', () => {
    expect(CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT).toBe(500)
    const documents = Array.from({ length: 501 }, (_, index) => buildDraftDocument(60_000 + index))
    const drafts = buildTripDrafts([buildDraftRoute('FR.GRANDE', { documents })])

    expect(resolveTripDraftSolverScope({ drafts, selectedRouteName: undefined }).isOverLimit).toBe(
      true,
    )
    expect(
      resolveTripDraftSolverScope({ drafts, selectedRouteName: 'FR.GRANDE' }).isOverLimit,
    ).toBe(true)
    const exact = buildTripDrafts([
      buildDraftRoute('FR.GRANDE', { documents: documents.slice(0, 500) }),
    ])
    expect(
      resolveTripDraftSolverScope({ drafts: exact, selectedRouteName: undefined }).isOverLimit,
    ).toBe(false)
  })
})

describe('a ação de montar a viagem', () => {
  test('quem só lê não vê a ação — nenhum botão, nenhum motivo', () => {
    expect(resolveTripDraftAction({ canManage: false, route: routeOf('FR.S.CAR') })).toEqual({
      kind: 'hidden',
    })
    expect(resolveTripDraftAction({ canManage: false, route: routeOf('FR.FRANC') })).toEqual({
      kind: 'hidden',
    })
  })

  test('com `trip.manage` e nota roteável a ação está ligada', () => {
    expect(resolveTripDraftAction({ canManage: true, route: routeOf('FR.R.PRE') })).toEqual({
      kind: 'enabled',
    })
  })

  test('sem nota roteável a ação fica desabilitada e diz o motivo certo', () => {
    expect(resolveTripDraftAction({ canManage: true, route: routeOf('FR.FRANC') })).toEqual({
      kind: 'disabled',
      reason: 'no_linked_documents',
    })
    expect(resolveTripDraftAction({ canManage: true, route: routeOf('FR.MATAO') })).toEqual({
      kind: 'disabled',
      reason: 'none_routable',
    })
  })
})

describe('as notas que ficam de fora', () => {
  test('conta cada motivo uma vez, com o atalho de volta ao detalhe', () => {
    const outside = describeTripDraftOutside(DEFAULT_TRIP_DRAFTS)

    expect(outside.hasAny).toBe(true)
    expect(outside.entries).toEqual([
      { count: 2, kind: 'in_live_trip', state: 'matched' },
      { count: 6, kind: 'awaiting_xml', state: 'awaiting_xml' },
      { count: 1, kind: 'suggested', state: 'suggested' },
      { count: 1, kind: 'ambiguous', state: 'ambiguous' },
      { count: 1, kind: 'invalid', state: 'invalid' },
    ])
  })

  test('só entra o motivo que tem nota; nada fora é prévia limpa', () => {
    const clean = buildTripDrafts([buildDraftRoute('FR.A', { documents: [buildDraftDocument(1)] })])

    expect(describeTripDraftOutside(clean)).toEqual({ entries: [], hasAny: false })
    const onlyWaiting = buildTripDrafts([
      buildDraftRoute('FR.A', { counts: buildCounts({ awaiting_xml: 3 }), missingCount: 3 }),
    ])
    expect(describeTripDraftOutside(onlyWaiting).entries).toEqual([
      { count: 3, kind: 'awaiting_xml', state: 'awaiting_xml' },
    ])
  })
})

describe('o estado da recomendação na URL', () => {
  test('aberta e com o roteiro escolhido, ida e volta', () => {
    const search = serializeTripDraftView({
      search: '?state=awaiting_xml',
      view: { isOpen: true, routeName: 'FR.S.CAR' },
    })

    expect(search).toBe('?state=awaiting_xml&recommend=1&draftRoute=FR.S.CAR')
    expect(parseTripDraftView(search)).toEqual({ isOpen: true, routeName: 'FR.S.CAR' })
  })

  test('fechada tira os dois parâmetros e preserva os filtros do detalhe', () => {
    expect(
      serializeTripDraftView({
        search: '?state=matched&recommend=1&draftRoute=A',
        view: { isOpen: false, routeName: undefined },
      }),
    ).toBe('?state=matched')
    expect(
      serializeTripDraftView({ search: '', view: { isOpen: false, routeName: undefined } }),
    ).toBe('')
  })

  test('roteiro com caractere especial sobrevive à ida e volta', () => {
    const search = serializeTripDraftView({
      search: '',
      view: { isOpen: true, routeName: 'FR&S=CAR #1' },
    })

    expect(parseTripDraftView(search).routeName).toBe('FR&S=CAR #1')
  })

  test('URL inventada não quebra: roteiro sem a recomendação aberta é ignorado', () => {
    expect(parseTripDraftView('?draftRoute=FR.S.CAR')).toEqual({
      isOpen: false,
      routeName: undefined,
    })
    expect(parseTripDraftView('?recommend=sim')).toEqual({ isOpen: false, routeName: undefined })
    expect(parseTripDraftView('?recommend=1&draftRoute=')).toEqual({
      isOpen: true,
      routeName: undefined,
    })
  })
})
