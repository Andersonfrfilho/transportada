/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 D10: as ações permitidas saem da máquina de estados e das permissões de quem pergunta.
 * Ressalvas do architect: A1 (sem `deliver`/`return` do barracão), A2 (`hasRoute` igual ao SQL) e
 * M2 (a ocorrência do galpão pelo mesmo portão do menu do operador).
 */
import { describe, expect, it } from 'bun:test'

import type { TripDocumentSeparationStatus, TripStatus } from '../../src/database/trip.schema.js'
import {
  resolveTripAllowedActions,
  resolveTripHasRoute,
  type AllowedActionsDocument,
  type AllowedActionsTripSnapshot,
  type TripActionCapabilities,
} from '../../src/trips/domain/trip-allowed-actions.policy.js'

const STOP_ID = '00000000-0000-4000-8000-000000000b01'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'

const OPERATOR: TripActionCapabilities = { canManage: true, canReportOnBehalf: true }
const SEPARATOR: TripActionCapabilities = { canManage: true, canReportOnBehalf: false }
const FINANCE: TripActionCapabilities = { canManage: false, canReportOnBehalf: true }
const VIEWER: TripActionCapabilities = { canManage: false, canReportOnBehalf: false }

function documentIn(
  separationStatus: TripDocumentSeparationStatus,
  overrides: Partial<AllowedActionsDocument> = {},
): AllowedActionsDocument {
  return { id: DOCUMENT_ID, releasedAt: null, separationStatus, stopId: STOP_ID, ...overrides }
}

function snapshot(input: {
  readonly documents?: readonly AllowedActionsDocument[]
  readonly hasDriver?: boolean
  readonly status: TripStatus
  readonly stopArrivedAt?: string | null
}): AllowedActionsTripSnapshot {
  return {
    documents: input.documents ?? [documentIn('loaded')],
    hasDriver: input.hasDriver ?? true,
    status: input.status,
    stops: [{ arrivedAt: input.stopArrivedAt ?? null, id: STOP_ID }],
  }
}

function documentActions(
  capabilities: TripActionCapabilities,
  trip: AllowedActionsTripSnapshot,
): readonly string[] {
  return resolveTripAllowedActions({ capabilities, trip }).documents[DOCUMENT_ID] ?? []
}

describe('allowedActions — por nota (spec 156 D10)', () => {
  it('aceite 4: em on_delivery_route, nota loaded tem fieldDelivery e fieldReturn', () => {
    expect(documentActions(OPERATOR, snapshot({ status: 'on_delivery_route' }))).toEqual([
      'fieldDelivery',
      'fieldReturn',
      'fieldOccurrence',
    ])
  })

  it('nota entregue: só anexar o canhoto e registrar ocorrência', () => {
    const trip = snapshot({ documents: [documentIn('delivered')], status: 'on_delivery_route' })
    expect(documentActions(FINANCE, trip)).toEqual(['fieldProof', 'fieldOccurrence'])
  })

  it('A1: o separador não recebe deliver, return nem ação de campo', () => {
    for (const status of ['dispatched', 'in_transit', 'on_delivery_route'] as const) {
      expect(documentActions(SEPARATOR, snapshot({ status }))).toEqual([])
    }
  })

  it('A1: o finance não recebe ação do barracão', () => {
    const trip = snapshot({ documents: [documentIn('pending')], status: 'separating' })
    expect(documentActions(FINANCE, trip)).toEqual([])
  })

  it('o barracão: separar, carregar e ocorrência de galpão pelo portão do operador (M2)', () => {
    expect(
      documentActions(
        SEPARATOR,
        snapshot({ documents: [documentIn('pending')], status: 'route_planned' }),
      ),
    ).toEqual(['separate', 'occurrence'])
    expect(
      documentActions(
        SEPARATOR,
        snapshot({ documents: [documentIn('separated')], status: 'separating' }),
      ),
    ).toEqual(['load', 'occurrence'])
  })

  /** Carregar a nota já carregada é `unchanged`; separar de novo a máquina aplica, e a lista diz. */
  it('não oferece ação que não muda nada (unchanged)', () => {
    const trip = snapshot({ documents: [documentIn('loaded')], status: 'loading' })
    expect(documentActions(SEPARATOR, trip)).toEqual(['separate', 'occurrence'])
    expect(documentActions(SEPARATOR, trip)).not.toContain('load')
  })

  it('nota liberada não tem ação nenhuma', () => {
    const trip = snapshot({
      documents: [documentIn('loaded', { releasedAt: '2026-09-18T10:00:00.000Z' })],
      status: 'on_delivery_route',
    })
    expect(documentActions(OPERATOR, trip)).toEqual([])
  })

  it('viagem sem motorista: nenhuma ação de campo', () => {
    const trip = snapshot({ hasDriver: false, status: 'on_delivery_route' })
    expect(documentActions(FINANCE, trip)).toEqual([])
    expect(resolveTripAllowedActions({ capabilities: FINANCE, trip }).stops).toEqual({})
    expect(resolveTripAllowedActions({ capabilities: FINANCE, trip }).trip).toEqual([])
  })

  it('viagem cancelada ou concluída: nada de rua para entregar', () => {
    expect(documentActions(OPERATOR, snapshot({ status: 'cancelled' }))).toEqual([])
    const completed = snapshot({ documents: [documentIn('delivered')], status: 'completed' })
    expect(documentActions(OPERATOR, completed)).toEqual(['fieldProof', 'fieldOccurrence'])
  })

  it('quem só lê não recebe ação', () => {
    const trip = snapshot({ status: 'on_delivery_route' })
    expect(resolveTripAllowedActions({ capabilities: VIEWER, trip })).toEqual({
      documents: {},
      stops: {},
      trip: [],
    })
  })
})

describe('allowedActions — por parada e por viagem', () => {
  it('parada sem chegada: chegar e registrar ocorrência; com chegada, só ocorrência', () => {
    const pending = resolveTripAllowedActions({
      capabilities: FINANCE,
      trip: snapshot({ status: 'in_transit' }),
    })
    expect(pending.stops[STOP_ID]).toEqual(['arrive', 'occurrence'])

    const arrived = resolveTripAllowedActions({
      capabilities: FINANCE,
      trip: snapshot({ status: 'in_transit', stopArrivedAt: '2026-09-18T11:00:00.000Z' }),
    })
    expect(arrived.stops[STOP_ID]).toEqual(['occurrence'])
  })

  it('parada fora da rua (antes do despacho ou concluída) não tem ação', () => {
    for (const status of ['loading', 'completed'] as const) {
      expect(
        resolveTripAllowedActions({ capabilities: FINANCE, trip: snapshot({ status }) }).stops,
      ).toEqual({})
    }
  })

  it('os dois toques só quando a máquina aplicaria (confirmLoad some em in_transit)', () => {
    const dispatched = resolveTripAllowedActions({
      capabilities: FINANCE,
      trip: snapshot({ status: 'dispatched' }),
    })
    expect(dispatched.trip).toEqual(['confirmLoad', 'startRoute'])

    const inTransit = resolveTripAllowedActions({
      capabilities: FINANCE,
      trip: snapshot({ status: 'in_transit' }),
    })
    expect(inTransit.trip).toEqual(['startRoute'])
  })

  it('o barracão: roteiro, despacho e cancelamento pela máquina', () => {
    const draft = resolveTripAllowedActions({
      capabilities: SEPARATOR,
      trip: snapshot({ documents: [documentIn('pending')], status: 'draft' }),
    })
    expect(draft.trip).toEqual(['planRoute', 'cancel'])

    const loading = resolveTripAllowedActions({
      capabilities: SEPARATOR,
      trip: snapshot({ status: 'loading' }),
    })
    expect(loading.trip).toEqual(['dispatch', 'cancel'])
  })

  it('o finance não recebe ação de viagem do barracão', () => {
    const loading = resolveTripAllowedActions({
      capabilities: FINANCE,
      trip: snapshot({ status: 'loading' }),
    })
    expect(loading.trip).toEqual([])
  })
})

describe('resolveTripHasRoute espelha o SQL de readRouteState (A2)', () => {
  it('sem parada não há roteiro', () => {
    expect(resolveTripHasRoute({ documents: [], stopCount: 0 })).toBe(false)
  })

  it('nota viva sem parada tira o roteiro', () => {
    const documents = [documentIn('pending', { stopId: null })]
    expect(resolveTripHasRoute({ documents, stopCount: 1 })).toBe(false)
  })

  it('nota devolvida sem parada não conta', () => {
    const documents = [documentIn('returned', { stopId: null })]
    expect(resolveTripHasRoute({ documents, stopCount: 1 })).toBe(true)
  })

  it('nota liberada sem parada não conta', () => {
    const documents = [
      documentIn('pending', { releasedAt: '2026-09-18T10:00:00.000Z', stopId: null }),
    ]
    expect(resolveTripHasRoute({ documents, stopCount: 1 })).toBe(true)
  })
})
