/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import {
  TripDispatchForceReasonRequiredError,
  TripHasUnloadedDocumentsError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'

export type DispatchTripPreconditions = {
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
  /** Ids de nota viva (não devolvida, não liberada) que nunca chegaram a `loaded`. */
  readonly unloadedDocumentIds: readonly string[]
}

export type DispatchTripWriteInput = {
  readonly actorUserId: string
  readonly companyId: string
  /** `true` só quando havia pendência real — despachar sem pendência nunca é "forçado". */
  readonly forced: boolean
  readonly forceReason: string | null
  readonly tripId: string
  readonly unloadedDocumentIds: readonly string[]
}

export type DispatchTripWriteResult = {
  readonly tripStatus: TripStatus
}

export type DispatchTripPort = {
  dispatch(input: DispatchTripWriteInput): Promise<DispatchTripWriteResult>
  readPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<DispatchTripPreconditions | null>
}

export type DispatchTripInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly force?: boolean
  readonly forceReason?: string | null
  readonly repository: DispatchTripPort
  readonly tripId: string
}

export type DispatchTripResult = {
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §2: `dispatched` é a porta de não-retorno. Nota pendente ou separada (nunca carregada)
 * recusa por padrão — `force` mais motivo obrigatório desvincula essas notas de volta ao pool
 * (spec 056 P2). Idempotente: despachar uma viagem já despachada não repete o congelamento nem
 * pede motivo de novo.
 */
export async function dispatchTrip(input: DispatchTripInput): Promise<DispatchTripResult> {
  const state = await input.repository.readPreconditions(input)
  if (state === null) throw new TripNotFoundError()

  const transition = checkTripTransition({
    action: TRIP_ACTION.dispatch,
    hasRoute: state.hasRoute,
    tripStatus: state.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') return { tripStatus: state.tripStatus }

  const forced = state.unloadedDocumentIds.length > 0
  if (forced) {
    if (!(input.force ?? false)) throw new TripHasUnloadedDocumentsError(state.unloadedDocumentIds)
    if ((input.forceReason ?? '').trim().length === 0) {
      throw new TripDispatchForceReasonRequiredError()
    }
  }

  const written = await input.repository.dispatch({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    forced,
    forceReason: forced ? (input.forceReason ?? null) : null,
    tripId: input.tripId,
    unloadedDocumentIds: state.unloadedDocumentIds,
  })

  return { tripStatus: written.tripStatus }
}
