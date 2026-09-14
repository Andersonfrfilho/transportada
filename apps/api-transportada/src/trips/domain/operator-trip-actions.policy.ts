/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016: quais ações o operador vê no menu do WhatsApp para uma viagem, derivadas dos
 * mesmos portões de `trip-state.policy.ts` — nunca uma tabela nova que possa discordar deles.
 * `apps/frontend-transportada/test/trip/state-gates.contract.ts` trava a mesma tabela do lado da
 * tela; se este arquivo divergir dele, o contrato desta task reprova e a task relata, não corrige
 * o frontend (CLAUDE.md "A viagem tem fases").
 */
import type { TripStatus } from '../../database/trip.schema.js'
import {
  TRIP_ACTION,
  TRIP_DOCUMENT_ACTION,
  checkTripAcceptsDocumentWork,
  checkTripTransition,
} from './trip-state.policy.js'

export const OPERATOR_TRIP_ACTION = {
  dispatch: 'dispatch',
  load: 'load',
  occurrence: 'occurrence',
  separate: 'separate',
} as const

export type OperatorTripActionId = (typeof OPERATOR_TRIP_ACTION)[keyof typeof OPERATOR_TRIP_ACTION]

export type ResolveOperatorTripActionsInput = {
  /** Nota viva (não liberada) que ainda não chegou a `loaded` — o que trava despacho sem `force`. */
  readonly hasPendingDocuments: boolean
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}

/**
 * Separar/carregar/ocorrência andam juntos: o mesmo portão (`checkTripAcceptsDocumentWork`) decide
 * os três, porque separar e carregar são o mesmo trabalho de barracão e a ocorrência de estágio
 * `separation` é anotação sobre esse mesmo trabalho. Despachar é o único que também olha nota
 * pendente — o portão da viagem por si só não sabe disso (`dispatchTrip` no `force` é quem sabe),
 * e esta função nunca chama `force`: despacho forçado é ação de exceção do painel (D7).
 */
export function resolveOperatorTripActions(
  input: ResolveOperatorTripActionsInput,
): readonly OperatorTripActionId[] {
  const actions: OperatorTripActionId[] = []

  const documentWorkBlock = checkTripAcceptsDocumentWork({
    action: TRIP_DOCUMENT_ACTION.separate,
    tripStatus: input.tripStatus,
  })
  if (documentWorkBlock === null) {
    actions.push(
      OPERATOR_TRIP_ACTION.separate,
      OPERATOR_TRIP_ACTION.load,
      OPERATOR_TRIP_ACTION.occurrence,
    )
  }

  const dispatch = checkTripTransition({
    action: TRIP_ACTION.dispatch,
    hasRoute: input.hasRoute,
    tripStatus: input.tripStatus,
  })
  if (dispatch.outcome === 'applied' && !input.hasPendingDocuments) {
    actions.push(OPERATOR_TRIP_ACTION.dispatch)
  }

  return actions
}
