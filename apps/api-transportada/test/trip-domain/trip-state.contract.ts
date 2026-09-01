/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_DOCUMENT_SEPARATION_STATUSES,
  TRIP_STATUSES,
  type TripDocumentSeparationStatus,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import {
  TRIP_ACTION,
  TRIP_DOCUMENT_ACTION,
  TRIP_TRANSITION_BLOCK,
  checkTripDocumentTransition,
  checkTripTransition,
  deriveTripStatus,
  tallyTripDocuments,
  type TripDocumentAction,
} from '../../src/trips/domain/trip-state.policy.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'

const DOCUMENT_ACTIONS = Object.values(TRIP_DOCUMENT_ACTION)
const DOCUMENT_TARGET_BY_ACTION: Readonly<
  Record<TripDocumentAction, TripDocumentSeparationStatus>
> = {
  deliver: 'delivered',
  load: 'loaded',
  return: 'returned',
  separate: 'separated',
}
const WAREHOUSE_STATUSES = ['route_planned', 'separating', 'loading'] as const
const DISPATCHED_STATUSES = ['dispatched', 'in_transit'] as const

const tallyOf = (statuses: readonly TripDocumentSeparationStatus[]) => tallyTripDocuments(statuses)

describe('trip document transitions (ADR-0043 §1)', () => {
  test('walks the happy path one step at a time, and never skips one', () => {
    for (const tripStatus of WAREHOUSE_STATUSES) {
      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.separate,
          documentStatus: 'pending',
          tripStatus,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'separated' })

      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.load,
          documentStatus: 'separated',
          tripStatus,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'loaded' })

      // A aresta que a spec cita por extenso: pending nunca vai direto a loaded.
      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.load,
          documentStatus: 'pending',
          tripStatus,
        }),
      ).toEqual({
        outcome: 'blocked',
        reason: TRIP_TRANSITION_BLOCK.documentNotSeparated,
      })
    }
  })

  test('delivers and returns only from loaded, and only on the road', () => {
    for (const tripStatus of DISPATCHED_STATUSES) {
      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.deliver,
          documentStatus: 'loaded',
          tripStatus,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'delivered' })

      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.return,
          documentStatus: 'loaded',
          tripStatus,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'returned' })

      for (const documentStatus of ['pending', 'separated'] as const) {
        expect(
          checkTripDocumentTransition({
            action: TRIP_DOCUMENT_ACTION.deliver,
            documentStatus,
            tripStatus,
          }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotLoaded })
      }
    }
  })

  test('keeps warehouse work out of the street and street work out of the warehouse', () => {
    for (const tripStatus of WAREHOUSE_STATUSES) {
      for (const action of [TRIP_DOCUMENT_ACTION.deliver, TRIP_DOCUMENT_ACTION.return]) {
        expect(
          checkTripDocumentTransition({ action, documentStatus: 'loaded', tripStatus }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripNotDispatched })
      }
    }

    for (const tripStatus of DISPATCHED_STATUSES) {
      for (const action of [TRIP_DOCUMENT_ACTION.separate, TRIP_DOCUMENT_ACTION.load]) {
        expect(
          checkTripDocumentTransition({ action, documentStatus: 'pending', tripStatus }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripAlreadyDispatched })
      }
    }
  })

  test('refuses to separate cargo whose route nobody confirmed', () => {
    expect(
      checkTripDocumentTransition({
        action: TRIP_DOCUMENT_ACTION.separate,
        documentStatus: 'pending',
        tripStatus: 'draft',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripRouteNotPlanned })
  })

  test('is idempotent on every action, from its own target status', () => {
    const repeats: ReadonlyArray<
      readonly [TripDocumentAction, TripDocumentSeparationStatus, TripStatus]
    > = [
      [TRIP_DOCUMENT_ACTION.separate, 'separated', 'separating'],
      [TRIP_DOCUMENT_ACTION.load, 'loaded', 'loading'],
      [TRIP_DOCUMENT_ACTION.deliver, 'delivered', 'in_transit'],
      [TRIP_DOCUMENT_ACTION.return, 'returned', 'in_transit'],
    ]

    for (const [action, documentStatus, tripStatus] of repeats) {
      expect(checkTripDocumentTransition({ action, documentStatus, tripStatus })).toEqual({
        outcome: 'unchanged',
      })
    }
  })

  test('treats delivered and returned as terminal for the other street action', () => {
    // Entregar uma nota devolvida (e vice-versa) passa o portão da viagem — as duas são ações de
    // rua — e para no terminal da nota, que é o motivo certo a mostrar.
    expect(
      checkTripDocumentTransition({
        action: TRIP_DOCUMENT_ACTION.deliver,
        documentStatus: 'returned',
        tripStatus: 'in_transit',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentAlreadyClosed })

    expect(
      checkTripDocumentTransition({
        action: TRIP_DOCUMENT_ACTION.return,
        documentStatus: 'delivered',
        tripStatus: 'in_transit',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentAlreadyClosed })
  })

  test('shows the trip reason, not the note reason, when the cargo already left', () => {
    // O estado da viagem é a restrição externa: separar nota entregue numa viagem em trânsito é
    // impossível pelos dois motivos, e "a carga já saiu" é o que a pessoa precisa ler.
    for (const documentStatus of ['delivered', 'returned'] as const) {
      for (const action of [TRIP_DOCUMENT_ACTION.separate, TRIP_DOCUMENT_ACTION.load]) {
        expect(
          checkTripDocumentTransition({ action, documentStatus, tripStatus: 'in_transit' }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripAlreadyDispatched })
      }
    }
  })

  test('refuses every document action that would change something, on a dead trip', () => {
    for (const [tripStatus, reason] of [
      ['cancelled', TRIP_TRANSITION_BLOCK.tripCancelled],
      ['completed', TRIP_TRANSITION_BLOCK.tripCompleted],
    ] as const) {
      for (const action of DOCUMENT_ACTIONS) {
        for (const documentStatus of ['pending', 'separated', 'loaded'] as const) {
          // Só as combinações que pedem mudança de verdade; a nota já no alvo é o no-op abaixo.
          if (documentStatus === DOCUMENT_TARGET_BY_ACTION[action]) continue

          expect(checkTripDocumentTransition({ action, documentStatus, tripStatus })).toEqual({
            outcome: 'blocked',
            reason,
          })
        }
      }
    }
  })

  test('still answers unchanged on a dead trip when the note is already at the target', () => {
    // Deliberado, e é o que salva a fila offline: a viagem completou entre o toque do motorista e
    // a drenagem da fila, e a confirmação duplicada de uma entrega que **funcionou** não pode
    // voltar como conflito (spec 057 D5).
    expect(
      checkTripDocumentTransition({
        action: TRIP_DOCUMENT_ACTION.deliver,
        documentStatus: 'delivered',
        tripStatus: 'completed',
      }),
    ).toEqual({ outcome: 'unchanged' })
  })

  test('answers every cell of the action × document status × trip status grid', () => {
    // 4 ações × 5 estados de nota × 8 estados de viagem = 160 arestas, e nenhuma pode ficar sem
    // resposta. É a rede que pega a aresta que ninguém pensou em nomear.
    let cells = 0
    for (const action of DOCUMENT_ACTIONS) {
      for (const documentStatus of TRIP_DOCUMENT_SEPARATION_STATUSES) {
        for (const tripStatus of TRIP_STATUSES) {
          const transition = checkTripDocumentTransition({ action, documentStatus, tripStatus })
          expect(['applied', 'unchanged', 'blocked']).toContain(transition.outcome)
          if (transition.outcome === 'blocked') {
            expect(Object.values(TRIP_TRANSITION_BLOCK)).toContain(transition.reason)
          }
          if (transition.outcome === 'applied') {
            expect(TRIP_DOCUMENT_SEPARATION_STATUSES).toContain(transition.nextStatus)
          }
          cells += 1
        }
      }
    }
    expect(cells).toBe(160)
  })
})

describe('trip manual transitions (ADR-0043 §1 e §2)', () => {
  test('plans the route once, and does not regress a trip already separating', () => {
    expect(
      checkTripTransition({ action: TRIP_ACTION.planRoute, hasRoute: true, tripStatus: 'draft' }),
    ).toEqual({ outcome: 'applied', nextStatus: 'route_planned' })

    for (const tripStatus of ['route_planned', 'separating', 'loading'] as const) {
      expect(
        checkTripTransition({ action: TRIP_ACTION.planRoute, hasRoute: true, tripStatus }),
      ).toEqual({ outcome: 'unchanged' })
    }
  })

  test('refuses to plan or dispatch without a route', () => {
    expect(
      checkTripTransition({ action: TRIP_ACTION.planRoute, hasRoute: false, tripStatus: 'draft' }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute })

    expect(
      checkTripTransition({ action: TRIP_ACTION.dispatch, hasRoute: false, tripStatus: 'draft' }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute })
  })

  test('dispatches from any warehouse phase, and never from draft', () => {
    for (const tripStatus of WAREHOUSE_STATUSES) {
      expect(
        checkTripTransition({ action: TRIP_ACTION.dispatch, hasRoute: true, tripStatus }),
      ).toEqual({ outcome: 'applied', nextStatus: 'dispatched' })
    }

    expect(
      checkTripTransition({ action: TRIP_ACTION.dispatch, hasRoute: true, tripStatus: 'draft' }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute })
  })

  test('never re-opens a dispatched trip for planning', () => {
    for (const tripStatus of DISPATCHED_STATUSES) {
      expect(
        checkTripTransition({ action: TRIP_ACTION.planRoute, hasRoute: true, tripStatus }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripAlreadyDispatched })
    }
  })

  test('cancels as an incident, even with the driver on the road, but never after completion', () => {
    for (const tripStatus of [...WAREHOUSE_STATUSES, ...DISPATCHED_STATUSES, 'draft'] as const) {
      expect(
        checkTripTransition({ action: TRIP_ACTION.cancel, hasRoute: true, tripStatus }),
      ).toEqual({ outcome: 'applied', nextStatus: 'cancelled' })
    }

    expect(
      checkTripTransition({ action: TRIP_ACTION.cancel, hasRoute: true, tripStatus: 'completed' }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted })

    expect(
      checkTripTransition({ action: TRIP_ACTION.cancel, hasRoute: true, tripStatus: 'cancelled' }),
    ).toEqual({ outcome: 'unchanged' })
  })

  test('answers every cell of the action × trip status × hasRoute grid', () => {
    let cells = 0
    for (const action of Object.values(TRIP_ACTION)) {
      for (const tripStatus of TRIP_STATUSES) {
        for (const hasRoute of [true, false]) {
          const transition = checkTripTransition({ action, hasRoute, tripStatus })
          expect(['applied', 'unchanged', 'blocked']).toContain(transition.outcome)
          if (transition.outcome === 'applied') {
            expect(TRIP_STATUSES).toContain(transition.nextStatus)
          }
          cells += 1
        }
      }
    }
    expect(cells).toBe(48)
  })
})

describe('derived trip status (ADR-0043 §1)', () => {
  test('an empty trip derives nothing — a vacuous truth is not a completed trip', () => {
    for (const tripStatus of TRIP_STATUSES) {
      expect(deriveTripStatus({ tally: tallyOf([]), tripStatus })).toBe(tripStatus)
    }
  })

  test('the first separated note moves the trip, and the first loaded one moves it again', () => {
    expect(
      deriveTripStatus({
        tally: tallyOf(['separated', 'pending', 'pending']),
        tripStatus: 'route_planned',
      }),
    ).toBe('separating')

    expect(
      deriveTripStatus({
        tally: tallyOf(['loaded', 'separated', 'pending']),
        tripStatus: 'separating',
      }),
    ).toBe('loading')
  })

  test('reaches in_transit on the first delivery and completed when nothing is left open', () => {
    expect(
      deriveTripStatus({ tally: tallyOf(['delivered', 'loaded']), tripStatus: 'dispatched' }),
    ).toBe('in_transit')

    expect(
      deriveTripStatus({ tally: tallyOf(['delivered', 'returned']), tripStatus: 'in_transit' }),
    ).toBe('completed')
  })

  test('counts a returned note as closed — completed does not mean everything was delivered', () => {
    expect(
      deriveTripStatus({ tally: tallyOf(['returned', 'returned']), tripStatus: 'dispatched' }),
    ).toBe('completed')
  })

  test('never walks backwards', () => {
    // A viagem despachada com tudo carregado não volta para `loading`.
    expect(
      deriveTripStatus({ tally: tallyOf(['loaded', 'loaded']), tripStatus: 'dispatched' }),
    ).toBe('dispatched')

    // Nem uma viagem em trânsito volta para `dispatched` porque ainda falta entregar.
    expect(
      deriveTripStatus({ tally: tallyOf(['delivered', 'loaded']), tripStatus: 'in_transit' }),
    ).toBe('in_transit')
  })

  test('never completes a trip that never left the warehouse', () => {
    for (const tripStatus of WAREHOUSE_STATUSES) {
      expect(deriveTripStatus({ tally: tallyOf(['loaded', 'loaded']), tripStatus })).toBe('loading')
    }
  })

  test('leaves cancelled and completed alone, whatever the notes say', () => {
    for (const tripStatus of ['cancelled', 'completed'] as const) {
      expect(deriveTripStatus({ tally: tallyOf(['pending', 'separated']), tripStatus })).toBe(
        tripStatus,
      )
    }
  })

  test('is stable: deriving twice from its own result changes nothing', () => {
    const tally = tallyOf(['delivered', 'loaded', 'pending'])
    const once = deriveTripStatus({ tally, tripStatus: 'dispatched' })
    expect(deriveTripStatus({ tally, tripStatus: once })).toBe(once)
  })
})

describe('transition error', () => {
  test('speaks the code the domain model promises, and names the reason', () => {
    const error = new TripStateTransitionNotAllowedError(TRIP_TRANSITION_BLOCK.documentNotSeparated)

    expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect(error.status).toBe(409)
    expect(error.reason).toBe(TRIP_TRANSITION_BLOCK.documentNotSeparated)
    expect(error.details?.[0]?.message).toContain('separated')
  })

  test('has a message for every block reason — none falls through as undefined', () => {
    for (const reason of Object.values(TRIP_TRANSITION_BLOCK)) {
      const error = new TripStateTransitionNotAllowedError(reason)
      expect(error.message.length).toBeGreaterThan(0)
      expect(error.message).not.toContain('undefined')
    }
  })
})
