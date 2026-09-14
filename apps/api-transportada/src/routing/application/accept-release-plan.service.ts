/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D10): no aceite, as notas que a planta da prévia deixou de fora nascem na viagem já
 * soltas, na fila de revisão. A planta só vale para o caminhão cuja carga ela desenhou — as mesmas
 * notas, em qualquer ordem; outra carga é recusa **antes** de consumir a sugestão (spec 110 D5a).
 */
import type { TripDocumentReviewReason } from '../../database/trip-document-review.schema.js'
import { TripCargoLayoutOutdatedError } from '../../trips/domain/trip-document-review.error.js'
import type { MultiVehicleScope } from './multi-vehicle-suggestion.port.js'
import type { MultiVehicleSuggestionGroup } from './multi-vehicle-suggestion.repository.js'
import type { TripComposer } from './multi-vehicle-suggestion.use-case.js'

export type AcceptReleaseEntry = {
  readonly layoutId: string
  readonly reason: TripDocumentReviewReason
}

/** Por veículo, a nota que sai → de qual planta e por quê. */
export type AcceptReleasePlans = ReadonlyMap<string, ReadonlyMap<string, AcceptReleaseEntry>>

function hasSameDocuments(left: readonly string[], right: readonly string[]): boolean {
  const expected = new Set(left)
  const received = new Set(right)
  return expected.size === received.size && [...expected].every((id) => received.has(id))
}

export async function resolveAcceptReleasePlans(params: {
  readonly context: MultiVehicleScope
  readonly groups: readonly MultiVehicleSuggestionGroup[]
  readonly layoutIds: readonly string[]
  readonly trips: TripComposer
}): Promise<AcceptReleasePlans> {
  if (params.layoutIds.length === 0) return new Map()
  const readReleasePlan = params.trips.readReleasePlan
  if (readReleasePlan === undefined) throw new Error('TRIP_COMPOSER_WITHOUT_RELEASE_PLAN')

  const plans = await Promise.all(
    params.layoutIds.map(async (layoutId) => ({
      ...(await readReleasePlan({ context: params.context, layoutId })),
      layoutId,
    })),
  )
  const byVehicle = new Map<string, ReadonlyMap<string, AcceptReleaseEntry>>()
  for (const plan of plans) {
    const group = params.groups.find((candidate) =>
      hasSameDocuments(candidate.documentIds, plan.documentIds),
    )
    if (group === undefined) throw new TripCargoLayoutOutdatedError()
    byVehicle.set(
      group.vehicleId,
      new Map(
        plan.released.map((entry) => [
          entry.documentId,
          { layoutId: plan.layoutId, reason: entry.reason },
        ]),
      ),
    )
  }
  return byVehicle
}
