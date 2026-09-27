/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 217 D1: o status da viagem é **função do par motorista+veículo**, não do status anterior.
 * O defeito que estes testes prendem: `checkDefineCrew` promovia `awaiting_crew → draft`
 * incondicionalmente, então definir só o veículo produzia uma viagem `draft` sem motorista — e
 * `draft` é exatamente a condição que faz "Planejar rota" aparecer.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_ACTION,
  TRIP_TRANSITION_BLOCK,
  checkTripTransition,
  resolveCrewStatus,
  type TripCrewComposition,
} from '../../src/trips/domain/trip-state.policy.js'

const COMPLETE: TripCrewComposition = { hasDriver: true, hasVehicle: true }
const DRIVER_ONLY: TripCrewComposition = { hasDriver: true, hasVehicle: false }
const VEHICLE_ONLY: TripCrewComposition = { hasDriver: false, hasVehicle: true }
const EMPTY: TripCrewComposition = { hasDriver: false, hasVehicle: false }

const INCOMPLETE = [DRIVER_ONLY, VEHICLE_ONLY, EMPTY] as const

describe('crew status is a function of the pair (spec 217 D1)', () => {
  test('only a complete pair is a draft', () => {
    expect(resolveCrewStatus(COMPLETE)).toBe('draft')
    for (const crew of INCOMPLETE) {
      expect(resolveCrewStatus(crew)).toBe('awaiting_crew')
    }
  })

  test('defining a complete crew leaves awaiting_crew', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE,
        hasRoute: false,
        tripStatus: 'awaiting_crew',
      }),
    ).toEqual({ outcome: 'applied', nextStatus: 'draft' })
  })

  /**
   * O coração da D1: metade da tripulação não promove nada. `unchanged` e não `applied`, porque o
   * status não muda — e a idempotência da rota depende de não gravar evento de status à toa.
   */
  test('half a crew keeps the trip awaiting_crew', () => {
    for (const crew of INCOMPLETE) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          tripStatus: 'awaiting_crew',
        }),
      ).toEqual({ outcome: 'unchanged' })
    }
  })

  test('swapping a complete crew in place keeps the trip in draft', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE,
        hasRoute: false,
        tripStatus: 'draft',
      }),
    ).toEqual({ outcome: 'unchanged' })
  })

  /**
   * A regressão que hoje não acontece: desfazer a tripulação de uma `draft` devolve a viagem para
   * `awaiting_crew`, e com isso "Planejar rota" para de ser oferecido (spec 217 RF6).
   */
  test('undoing the crew sends a draft back to awaiting_crew', () => {
    for (const crew of INCOMPLETE) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          tripStatus: 'draft',
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'awaiting_crew' })
    }
  })

  /** Os portões terminais não mudam com a D1, e a composição do par não os afrouxa. */
  test('terminal statuses refuse the swap whatever the pair says', () => {
    for (const crew of [COMPLETE, ...INCOMPLETE]) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          tripStatus: 'cancelled',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled })

      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          tripStatus: 'completed',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted })
    }
  })
})
