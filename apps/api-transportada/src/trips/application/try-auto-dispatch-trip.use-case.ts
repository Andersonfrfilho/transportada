/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 (D4, ADR-0074 §1/§2): a escrita que fecha a carga — carregar a última nota (linha,
 * lote, WhatsApp) ou registrar a ocorrência que libera a última pendente — tenta despachar a
 * viagem sozinha, com o mesmo ator e canal da escrita, logo depois dela ter comitado.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { dispatchTrip, type DispatchTripPort } from './dispatch-trip.use-case.js'
import {
  TripHasUnscheduledStopsError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'

/** Só nesses três estados a escrita de barracão pode fechar a carga e despachar sozinha. */
const AUTO_DISPATCH_ELIGIBLE_STATUSES: readonly TripStatus[] = [
  'route_planned',
  'separating',
  'loading',
]

export type TryAutoDispatchTripBlockedCode = 'TRIP_HAS_NO_ROUTE' | 'TRIP_HAS_UNSCHEDULED_STOPS'

export type TryAutoDispatchTripResult =
  | {
      readonly code: TryAutoDispatchTripBlockedCode
      readonly details?: { readonly stopIds: readonly string[] }
      readonly outcome: 'blocked'
    }
  | { readonly outcome: 'dispatched' }

export type TryAutoDispatchTripInput = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly onBehalfOfDriverId?: string | null
  readonly repository: DispatchTripPort
  readonly tripId: string
}

/**
 * ADR-0074 §1/§2: nunca `force` — um gate recusado não desfaz a escrita que chamou (ela já
 * comitou antes desta função rodar), a viagem só fica esperando o botão. Fora dos três estados de
 * barracão, ou com carga ainda aberta, não há nada a tentar (`undefined`, RF2/RF3).
 */
export async function tryAutoDispatchTrip(
  input: TryAutoDispatchTripInput,
): Promise<TryAutoDispatchTripResult | undefined> {
  const state = await input.repository.readPreconditions({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  if (state === null) return undefined
  if (!AUTO_DISPATCH_ELIGIBLE_STATUSES.includes(state.tripStatus)) return undefined
  if (!state.isCargoClosed) return undefined

  try {
    await dispatchTrip({
      actorUserId: input.actorUserId,
      channel: input.channel,
      companyId: input.companyId,
      onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
      repository: input.repository,
      tripId: input.tripId,
    })
    return { outcome: 'dispatched' }
  } catch (error) {
    /**
     * Fallback gracioso (code-standart §7): estes dois gates são o que ADR-0074 §2 descreve como
     * "a viagem fica esperando o botão" — nunca motivo para desfazer a carga já escrita. Qualquer
     * outro erro (viagem não encontrada, conflito de estado inesperado) propaga.
     */
    if (error instanceof TripHasUnscheduledStopsError) {
      return {
        code: 'TRIP_HAS_UNSCHEDULED_STOPS',
        details: { stopIds: error.stopIds },
        outcome: 'blocked',
      }
    }
    if (
      error instanceof TripStateTransitionNotAllowedError &&
      error.reason === 'TRIP_HAS_NO_ROUTE'
    ) {
      return { code: 'TRIP_HAS_NO_ROUTE', outcome: 'blocked' }
    }
    throw error
  }
}
