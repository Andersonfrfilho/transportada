/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 RF2: o ordenador roda **depois** do vínculo e nunca o derruba — mesmo molde de
 * `freezeTripRouteGracefully`. O aviso carrega só identificadores: coordenada e endereço não vão a log (RNF2).
 */
import type { TripRouteFreezeLogger } from './freeze-trip-route-gracefully.js'
import type { OrderDraftTripStops } from './order-draft-trip-stops.use-case.js'

export const DRAFT_STOP_ORDER_FAILED_MESSAGE = 'trip_stop_order_failed'

/** Lê as paradas antes do vínculo. Falhar aqui só desliga o modo `insert_new`, nunca o vínculo. */
export async function snapshotStopIdsGracefully(input: {
  readonly companyId: string
  readonly logger?: TripRouteFreezeLogger
  readonly orderer: OrderDraftTripStops | undefined
  readonly tripId: string
}): Promise<ReadonlySet<string> | undefined> {
  if (input.orderer === undefined) return undefined
  try {
    return await input.orderer.snapshotStopIds({ companyId: input.companyId, tripId: input.tripId })
  } catch (error) {
    input.logger?.warn(DRAFT_STOP_ORDER_FAILED_MESSAGE, {
      errorName: error instanceof Error ? error.name : 'unknown',
      phase: 'snapshot',
      tripId: input.tripId,
    })
    return undefined
  }
}

export async function orderDraftTripStopsGracefully(input: {
  readonly companyId: string
  readonly knownStopIds: ReadonlySet<string> | undefined
  readonly logger?: TripRouteFreezeLogger
  readonly orderer: OrderDraftTripStops | undefined
  readonly tripId: string
}): Promise<void> {
  if (input.orderer === undefined) return
  try {
    await input.orderer.execute({
      companyId: input.companyId,
      ...(input.knownStopIds === undefined ? {} : { knownStopIds: input.knownStopIds }),
      tripId: input.tripId,
    })
  } catch (error) {
    input.logger?.warn(DRAFT_STOP_ORDER_FAILED_MESSAGE, {
      errorName: error instanceof Error ? error.name : 'unknown',
      phase: 'order',
      tripId: input.tripId,
    })
  }
}
