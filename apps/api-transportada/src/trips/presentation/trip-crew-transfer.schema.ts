/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 D3: o corpo e a resposta de `POST /trips/:id/crew-transfers`. O corpo é estrito — nem
 * `vehicleId` entra, porque trocar o caminhão no meio da viagem apagaria a rota congelada (D2).
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { TRIP_CREW_EVENT_REASON_MAXIMUM_LENGTH } from '../../database/trip.schema.js'
import type { TripCrewTransferSummary } from '../application/trip-crew-transfer.types.js'
import { MAX_TRIP_DRIVERS, refineCrewSize } from './trip-request.schema.js'

export const transferTripCrewSchema = z
  .object({
    /** A posição 1 é sempre condutor (`trip_drivers_lead_role_check`): sem motorista não há viagem. */
    driverIds: z.array(z.uuid()).min(1).max(MAX_TRIP_DRIVERS),
    helperIds: z.array(z.uuid()).max(MAX_TRIP_DRIVERS).default([]),
    reason: z.string().trim().min(1).max(TRIP_CREW_EVENT_REASON_MAXIMUM_LENGTH),
  })
  .strict()
  .superRefine(refineCrewSize)

export type TransferTripCrewBody = z.infer<typeof transferTripCrewSchema>

export async function parseTransferTripCrewRequest(
  request: Request,
): Promise<TransferTripCrewBody> {
  return parseBody(transferTripCrewSchema, request)
}

/** As seis chaves do contrato e nenhuma outra: o retrato da tripulação do evento não sai por aqui. */
export function serializeTripCrewTransfer(
  transfer: TripCrewTransferSummary,
): TripCrewTransferSummary {
  return {
    costAfter: transfer.costAfter,
    costBefore: transfer.costBefore,
    costDifference: transfer.costDifference,
    costHasGaps: transfer.costHasGaps,
    id: transfer.id,
    mdfeDriverDivergence: transfer.mdfeDriverDivergence,
  }
}
