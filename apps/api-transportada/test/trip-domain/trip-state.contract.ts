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
/** Spec 217 D1: a grade da 216 continua valendo com o par completo — o par pela metade é a 217. */
const COMPLETE_CREW = { hasDriver: true, hasVehicle: true } as const

const WAREHOUSE_STATUSES = ['route_planned', 'separating', 'loading'] as const
const DISPATCHED_STATUSES = ['dispatched', 'in_transit', 'on_delivery_route'] as const

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

  /**
   * Spec 182 RF3 (decisão do usuário em 24/09): `deliver` deixa de exigir a viagem despachada —
   * a baixa de entrega fica disponível a partir da linha da nota em qualquer estado não-terminal,
   * para corrigir registro ou lançar entrega feita por fora da viagem. `return` continua exigindo
   * rua: devolução é sempre um retorno físico de algo que saiu.
   */
  test('delivers from loaded in any non-terminal state; returns only from loaded, and only on the road', () => {
    for (const tripStatus of [...WAREHOUSE_STATUSES, ...DISPATCHED_STATUSES]) {
      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.deliver,
          documentStatus: 'loaded',
          tripStatus,
        }),
      ).toEqual({ outcome: 'applied', nextStatus: 'delivered' })

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

    for (const tripStatus of DISPATCHED_STATUSES) {
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
            action: TRIP_DOCUMENT_ACTION.return,
            documentStatus,
            tripStatus,
          }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotLoaded })
      }
    }
  })

  test('keeps return out of the warehouse, and keeps warehouse work out of the street', () => {
    for (const tripStatus of WAREHOUSE_STATUSES) {
      expect(
        checkTripDocumentTransition({
          action: TRIP_DOCUMENT_ACTION.return,
          documentStatus: 'loaded',
          tripStatus,
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripNotDispatched })
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
    // 4 ações × 5 estados de nota × 10 estados de viagem (spec 216: + awaiting_crew) = 200
    // arestas, e nenhuma pode ficar sem resposta. É a rede que pega a aresta que ninguém pensou
    // em nomear.
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
    expect(cells).toBe(200)
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

  // Feature 147 D3/T11: o cavalo não carrega sozinho — sem carreta, o despacho barra.
  describe('dispatch requires a trailer on a tractor unit', () => {
    test('blocks dispatch when the tractor unit has no trailer', () => {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.dispatch,
          hasRoute: true,
          requiresTrailer: true,
          tripStatus: 'loading',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripTrailerRequired })
    })

    test('the route gate comes before the trailer gate', () => {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.dispatch,
          hasRoute: false,
          requiresTrailer: true,
          tripStatus: 'draft',
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute })
    })

    test('dispatches once the trailer is no longer required', () => {
      for (const tripStatus of WAREHOUSE_STATUSES) {
        expect(
          checkTripTransition({
            action: TRIP_ACTION.dispatch,
            hasRoute: true,
            requiresTrailer: false,
            tripStatus,
          }),
        ).toEqual({ outcome: 'applied', nextStatus: 'dispatched' })
      }
    })

    test('leaves every other action untouched, requiresTrailer absent or not', () => {
      for (const action of Object.values(TRIP_ACTION)) {
        // defineCrew exige crew/vehicleChanged (spec 217 D1) — fora do que requiresTrailer decide.
        if (action === TRIP_ACTION.dispatch || action === TRIP_ACTION.defineCrew) continue
        const without = checkTripTransition({ action, hasRoute: true, tripStatus: 'draft' })
        const withTrue = checkTripTransition({
          action,
          hasRoute: true,
          requiresTrailer: true,
          tripStatus: 'draft',
        })
        expect(withTrue).toEqual(without)
      }
    })

    test('re-checks unchanged for a trip already dispatched, trailer or not', () => {
      for (const tripStatus of DISPATCHED_STATUSES) {
        expect(
          checkTripTransition({
            action: TRIP_ACTION.dispatch,
            hasRoute: true,
            requiresTrailer: true,
            tripStatus,
          }),
        ).toEqual({ outcome: 'unchanged' })
      }
    })
  })

  test('answers every cell of the action × trip status × hasRoute grid', () => {
    let cells = 0
    for (const action of Object.values(TRIP_ACTION)) {
      for (const tripStatus of TRIP_STATUSES) {
        for (const hasRoute of [true, false]) {
          /**
           * Spec 217 D1: `defineCrew` exige a composição resultante, e aqui ela é o par completo —
           * a grade prova que toda célula responde, e o par pela metade é provado em
           * `crew-status.contract.ts`, onde o desfecho por composição é o assunto.
           */
          const transition =
            action === TRIP_ACTION.defineCrew
              ? checkTripTransition({
                  action,
                  crew: COMPLETE_CREW,
                  hasRoute,
                  tripStatus,
                  vehicleChanged: false,
                })
              : checkTripTransition({ action, hasRoute, tripStatus })
          expect(['applied', 'unchanged', 'blocked']).toContain(transition.outcome)
          if (transition.outcome === 'applied') {
            expect(TRIP_STATUSES).toContain(transition.nextStatus)
          }
          cells += 1
        }
      }
    }
    expect(cells).toBe(180)
  })

  /**
   * Spec 216: `awaiting_crew` só sai por duas portas — definir a tripulação (vira `draft`) ou
   * cancelar. Toda outra ação manual é recusada com o mesmo motivo, nunca deriva silenciosamente
   * um `hasRoute` que a viagem sem tripulação nem deveria ter.
   */
  test('awaiting_crew only leaves through defineCrew or cancel', () => {
    for (const action of [
      TRIP_ACTION.planRoute,
      TRIP_ACTION.dispatch,
      TRIP_ACTION.confirmLoad,
      TRIP_ACTION.startRoute,
      TRIP_ACTION.close,
    ] as const) {
      for (const hasRoute of [true, false]) {
        expect(checkTripTransition({ action, hasRoute, tripStatus: 'awaiting_crew' })).toEqual({
          outcome: 'blocked',
          reason: TRIP_TRANSITION_BLOCK.tripCrewNotDefined,
        })
      }
    }

    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE_CREW,
        hasRoute: false,
        vehicleChanged: false,
        tripStatus: 'awaiting_crew',
      }),
    ).toEqual({ outcome: 'applied', nextStatus: 'draft' })

    expect(
      checkTripTransition({
        action: TRIP_ACTION.cancel,
        hasRoute: false,
        tripStatus: 'awaiting_crew',
      }),
    ).toEqual({ outcome: 'applied', nextStatus: 'cancelled' })
  })

  /** defineCrew só faz sentido enquanto falta tripulação — em qualquer outro status, é 409. */
  /**
   * defineCrew também troca motorista/veículo enquanto a viagem está `draft` — antes do roteiro
   * planejado, nada calculado a partir do veículo (pedágio) foi congelado, então a troca não deixa
   * número velho para trás. A partir de `route_planned` a troca fica bloqueada.
   */
  test('defineCrew swaps crew in place while draft, and refuses once separation starts', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE_CREW,
        hasRoute: false,
        vehicleChanged: false,
        tripStatus: 'draft',
      }),
    ).toEqual({ outcome: 'unchanged' })

    /**
     * Spec 217 D2: `route_planned` **saiu** desta lista — a troca passou a ser permitida lá, e a
     * porta que fecha é a separação. A janela inteira e a tabela do par pela metade são assunto de
     * `crew-status.contract.ts`; aqui fica o que a 216 já provava, com o limite novo.
     */
    for (const tripStatus of ['separating', 'loading', ...DISPATCHED_STATUSES] as const) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew: COMPLETE_CREW,
          hasRoute: false,
          vehicleChanged: false,
          tripStatus,
        }),
      ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripSeparationStarted })
    }

    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE_CREW,
        hasRoute: false,
        vehicleChanged: false,
        tripStatus: 'cancelled',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled })

    expect(
      checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: COMPLETE_CREW,
        hasRoute: false,
        vehicleChanged: false,
        tripStatus: 'completed',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted })
  })

  /**
   * Spec 249 D1: a viagem que já saiu troca de motorista e de ajudante por uma ação **própria**. A
   * janela da `defineCrew` (217) não se mexe — as duas janelas nunca se sobrepõem, e o resultado
   * de status é sempre `unchanged`: transferir tripulação não é uma transição de viagem.
   */
  test('transferCrew is released on the road and never changes the status', () => {
    for (const tripStatus of DISPATCHED_STATUSES) {
      for (const hasRoute of [true, false]) {
        expect(
          checkTripTransition({ action: TRIP_ACTION.transferCrew, hasRoute, tripStatus }),
        ).toEqual({ outcome: 'unchanged' })
      }
    }
  })

  /** Spec 257 D1: a janela de acrescentar notas é a da rua — `dispatched`, `in_transit`, `on_delivery_route`. */
  test('linkDocumentsAfterDispatch is released only on the road and never changes the status', () => {
    for (const tripStatus of ['dispatched', 'in_transit', 'on_delivery_route'] as const) {
      for (const hasRoute of [true, false]) {
        expect(
          checkTripTransition({
            action: TRIP_ACTION.linkDocumentsAfterDispatch,
            hasRoute,
            tripStatus,
          }),
        ).toEqual({ outcome: 'unchanged' })
      }
    }
  })

  test('linkDocumentsAfterDispatch names why each status outside the road refuses it', () => {
    const expected = [
      ['cancelled', TRIP_TRANSITION_BLOCK.tripCancelled],
      ['completed', TRIP_TRANSITION_BLOCK.tripCompleted],
      ['draft', TRIP_TRANSITION_BLOCK.tripNotDispatched],
      ['loading', TRIP_TRANSITION_BLOCK.tripNotDispatched],
    ] as const
    for (const [tripStatus, reason] of expected) {
      expect(
        checkTripTransition({
          action: TRIP_ACTION.linkDocumentsAfterDispatch,
          hasRoute: true,
          tripStatus,
        }),
      ).toEqual({ outcome: 'blocked', reason })
    }
  })

  test('transferCrew names why a dead trip refuses it', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.transferCrew,
        hasRoute: true,
        tripStatus: 'cancelled',
      }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled })
  })

  test('transferCrew is allowed on a completed trip without changing its status', () => {
    expect(
      checkTripTransition({
        action: TRIP_ACTION.transferCrew,
        hasRoute: true,
        tripStatus: 'completed',
      }),
    ).toEqual({ outcome: 'unchanged' })
  })

  test('transferCrew before the dispatch is refused as not dispatched, even without a crew', () => {
    for (const tripStatus of [
      'awaiting_crew',
      'draft',
      'route_planned',
      'separating',
      'loading',
    ] as const) {
      for (const hasRoute of [true, false]) {
        expect(
          checkTripTransition({ action: TRIP_ACTION.transferCrew, hasRoute, tripStatus }),
        ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripNotDispatched })
      }
    }
  })

  test('transferCrew and defineCrew windows never overlap', () => {
    for (const tripStatus of TRIP_STATUSES) {
      const transferable =
        checkTripTransition({ action: TRIP_ACTION.transferCrew, hasRoute: true, tripStatus })
          .outcome !== 'blocked'
      const swappable =
        checkTripTransition({
          action: TRIP_ACTION.defineCrew,
          crew: COMPLETE_CREW,
          hasRoute: true,
          tripStatus,
          vehicleChanged: false,
        }).outcome !== 'blocked'

      expect(transferable && swappable).toBe(false)
    }
  })

  // spec 158 T12 (PERGUNTAS-ABERTAS #28): `close` sai da máquina de estados, não de um `if` solto —
  // sempre rumo a `completed`, exceto a viagem cancelada, que fica fora do alcance do botão.
  test('closes toward completed from any status, except a cancelled trip', () => {
    for (const tripStatus of ['draft', ...WAREHOUSE_STATUSES, ...DISPATCHED_STATUSES] as const) {
      expect(
        checkTripTransition({ action: TRIP_ACTION.close, hasRoute: false, tripStatus }),
      ).toEqual({ outcome: 'applied', nextStatus: 'completed' })
    }

    expect(
      checkTripTransition({ action: TRIP_ACTION.close, hasRoute: false, tripStatus: 'cancelled' }),
    ).toEqual({ outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled })

    expect(
      checkTripTransition({ action: TRIP_ACTION.close, hasRoute: false, tripStatus: 'completed' }),
    ).toEqual({ outcome: 'unchanged' })
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

  /**
   * ⚠️ A ADR-0058 moveu o alvo desta derivação: `in_transit` passou a ser o toque de conferir a
   * carga, e a primeira nota fechada adianta direto para `on_delivery_route`. Fechar nota é prova de
   * que a viagem está na rua — mais forte que o toque que alguém pode ter esquecido.
   */
  test('reaches on_delivery_route on the first delivery and completed when nothing is left open', () => {
    expect(
      deriveTripStatus({ tally: tallyOf(['delivered', 'loaded']), tripStatus: 'dispatched' }),
    ).toBe('on_delivery_route')

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

    // Nem uma viagem em trânsito volta para `dispatched` porque ainda falta entregar — e a nota
    // já fechada a adianta para a rua, que é o estado que a ADR-0058 acrescentou.
    expect(
      deriveTripStatus({ tally: tallyOf(['delivered', 'loaded']), tripStatus: 'in_transit' }),
    ).toBe('on_delivery_route')

    // E a viagem já em rota não recua para em trânsito enquanto sobra nota aberta.
    expect(
      deriveTripStatus({ tally: tallyOf(['loaded', 'loaded']), tripStatus: 'on_delivery_route' }),
    ).toBe('on_delivery_route')
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
