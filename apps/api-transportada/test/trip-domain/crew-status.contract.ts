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
        vehicleChanged: false,
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
          vehicleChanged: false,
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
        vehicleChanged: false,
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
          vehicleChanged: false,
          tripStatus: 'draft',
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'awaiting_crew' })
    }
  })

  /**
   * Spec 217 D2/RF4: o corte da troca passa a ser a separação. `route_planned` entra na janela —
   * quem decide é o trabalho humano já investido, não o dado: em `separating` o separador está com
   * papel na mão contando volume para um caminhão específico.
   */
  test('swapping the vehicle in route_planned sends the trip back to draft', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE,
        hasRoute: true,
        tripStatus: 'route_planned',
        vehicleChanged: true,
      }),
    ).toEqual({ outcome: 'applied', nextStatus: 'draft' })
  })

  /**
   * Spec 217 D3: a rota sai da classe e dos eixos do caminhão — quem dirige não entra nessa conta
   * (097 D1/D3/D4). Trocar só o motorista deixa o roteiro de pé, e a viagem nem sai de
   * `route_planned`: nada a replanejar.
   */
  test('swapping only the driver in route_planned leaves the route standing', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE,
        hasRoute: true,
        tripStatus: 'route_planned',
        vehicleChanged: false,
      }),
    ).toEqual({ outcome: 'unchanged' })
  })

  /**
   * Spec 217 D3, a volta: viagem que caiu para `awaiting_crew` com a rota intacta retorna direto
   * para `route_planned` quando o par se completa sem trocar o caminhão. Exigir replanejamento de
   * uma rota que nunca deixou de valer seria trabalho inventado.
   */
  test('completing the crew again restores route_planned when the route never died', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE,
        hasRoute: true,
        tripStatus: 'awaiting_crew',
        vehicleChanged: false,
      }),
    ).toEqual({ outcome: 'applied', nextStatus: 'route_planned' })
  })

  /**
   * Trocar em `route_planned` **regride** para `draft` (D3): a rota foi congelada com o veículo
   * antigo e o operador replaneja. Por isso o desfecho é `applied`, não `unchanged` — é o que faz o
   * botão "Planejar rota" reaparecer.
   */
  test('undoing the crew in route_planned also lands on awaiting_crew', () => {
    for (const crew of INCOMPLETE) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: true,
          tripStatus: 'route_planned',
          vehicleChanged: false,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'awaiting_crew' })
    }
  })

  /** A partir da separação, a recusa tem nome honesto: não é "já tem tripulação", é "o barracão começou". */
  test('separation closes the door, with a name that says why', () => {
    for (const tripStatus of ['separating', 'loading'] as const) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew: COMPLETE,
          hasRoute: true,
          tripStatus,
          vehicleChanged: true,
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripSeparationStarted })
    }

    for (const tripStatus of ['dispatched', 'in_transit', 'on_delivery_route'] as const) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew: COMPLETE,
          hasRoute: true,
          tripStatus,
          vehicleChanged: true,
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripSeparationStarted })
    }
  })

  /** D2: `tripCrewAlreadyDefined` perdeu o último uso e sai — o código antigo não pode sobreviver. */
  test('the old refusal code is gone', () => {
    expect(Object.values(TRIP_TRANSITION_BLOCK)).not.toContain('TRIP_CREW_ALREADY_DEFINED')
  })

  /** Os portões terminais não mudam com a D1, e a composição do par não os afrouxa. */
  test('terminal statuses refuse the swap whatever the pair says', () => {
    for (const crew of [COMPLETE, ...INCOMPLETE]) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          vehicleChanged: false,
          tripStatus: 'cancelled',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled })

      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew,
          hasRoute: false,
          vehicleChanged: false,
          tripStatus: 'completed',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted })
    }
  })
})
