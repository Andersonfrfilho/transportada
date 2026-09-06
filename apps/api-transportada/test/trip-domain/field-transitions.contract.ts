/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0058: o começo da viagem passa a ser toque do motorista, e o fim continua derivado.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_STATUSES, type TripStatus } from '../../src/database/trip.schema.js'
import {
  TRIP_ACTION,
  TRIP_TRANSITION_BLOCK,
  checkTripTransition,
  deriveTripStatus,
  isTripDispatched,
  tallyTripDocuments,
  tripStatusRank,
} from '../../src/trips/domain/trip-state.policy.js'

const ROUTED = { hasRoute: true } as const

function transition(action: 'confirmLoad' | 'startRoute', tripStatus: TripStatus) {
  return checkTripTransition({ action: TRIP_ACTION[action], ...ROUTED, tripStatus })
}

describe('o estado novo entra na ordem, entre em trânsito e concluída', () => {
  test('`on_delivery_route` é um dos estados da viagem', () => {
    expect(TRIP_STATUSES).toContain('on_delivery_route')
  })

  test('ele fica depois de em trânsito e antes de concluída', () => {
    expect(tripStatusRank('on_delivery_route')).toBeGreaterThan(tripStatusRank('in_transit'))
    expect(tripStatusRank('on_delivery_route')).toBeLessThan(tripStatusRank('completed'))
  })

  /* Quem está em rota está na rua: entregar e devolver dependem deste portão (ADR-0043). */
  test('quem está em rota conta como despachada', () => {
    expect(isTripDispatched('on_delivery_route')).toBe(true)
  })
})

describe('conferir a carga (dispatched → in_transit)', () => {
  test('a viagem despachada aceita a conferência', () => {
    expect(transition('confirmLoad', 'dispatched')).toEqual({
      outcome: 'applied',
      nextStatus: 'in_transit',
    })
  })

  /* A rede do pátio cai e o separador toca duas vezes: repetir converge, não erra. */
  test('conferir de novo não é erro', () => {
    expect(transition('confirmLoad', 'in_transit')).toEqual({ outcome: 'unchanged' })
    expect(transition('confirmLoad', 'on_delivery_route')).toEqual({ outcome: 'unchanged' })
  })

  test('viagem que ainda não saiu do barracão não tem carga a conferir', () => {
    for (const tripStatus of ['draft', 'route_planned', 'separating', 'loading'] as const) {
      expect(transition('confirmLoad', tripStatus)).toEqual({
        outcome: 'blocked',
        reason: TRIP_TRANSITION_BLOCK.tripNotDispatched,
      })
    }
  })

  test('viagem cancelada e concluída não voltam para a conferência', () => {
    expect(transition('confirmLoad', 'cancelled')).toEqual({
      outcome: 'blocked',
      reason: TRIP_TRANSITION_BLOCK.tripCancelled,
    })
    expect(transition('confirmLoad', 'completed')).toEqual({
      outcome: 'blocked',
      reason: TRIP_TRANSITION_BLOCK.tripCompleted,
    })
  })
})

describe('iniciar trajeto (in_transit → on_delivery_route)', () => {
  test('a viagem conferida aceita o início do trajeto', () => {
    expect(transition('startRoute', 'in_transit')).toEqual({
      outcome: 'applied',
      nextStatus: 'on_delivery_route',
    })
  })

  /**
   * Quem esqueceu de conferir e já está na estrada não fica preso: iniciar o trajeto vale como
   * conferência. A ADR-0058 §3 exige que nenhum toque esquecido trave trabalho.
   */
  test('iniciar direto de despachada também vale', () => {
    expect(transition('startRoute', 'dispatched')).toEqual({
      outcome: 'applied',
      nextStatus: 'on_delivery_route',
    })
  })

  test('iniciar de novo não é erro', () => {
    expect(transition('startRoute', 'on_delivery_route')).toEqual({ outcome: 'unchanged' })
  })

  test('viagem no barracão não inicia trajeto', () => {
    expect(transition('startRoute', 'loading')).toEqual({
      outcome: 'blocked',
      reason: TRIP_TRANSITION_BLOCK.tripNotDispatched,
    })
  })
})

describe('o fim continua derivado, e o toque esquecido não trava (ADR-0058 §3)', () => {
  const derive = (tripStatus: TripStatus, statuses: readonly string[]) =>
    deriveTripStatus({ tally: tallyTripDocuments(statuses as never), tripStatus })

  test('fechar a primeira nota adianta a viagem que ninguém tocou', () => {
    expect(derive('dispatched', ['delivered', 'loaded', 'loaded'])).toBe('on_delivery_route')
    expect(derive('in_transit', ['delivered', 'loaded'])).toBe('on_delivery_route')
  })

  test('fechar a última nota conclui', () => {
    expect(derive('on_delivery_route', ['delivered', 'returned'])).toBe('completed')
  })

  test('sem nota fechada o estado é o que o toque deixou', () => {
    expect(derive('dispatched', ['loaded', 'loaded'])).toBe('dispatched')
    expect(derive('in_transit', ['loaded', 'loaded'])).toBe('in_transit')
    expect(derive('on_delivery_route', ['loaded', 'loaded'])).toBe('on_delivery_route')
  })

  /* `tripStatusRank` é o que permite conviver toque e derivação sem uma desfazer a outra. */
  test('a derivação nunca puxa a viagem para trás', () => {
    expect(derive('on_delivery_route', ['loaded', 'delivered'])).toBe('on_delivery_route')
  })
})
