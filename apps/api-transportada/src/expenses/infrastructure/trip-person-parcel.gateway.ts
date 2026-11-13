/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1d (T1.4b): a linha da pessoa na parcela de pessoal da viagem, lida da **única** conta de valoração do
 * produto (`buildValuationFromContext`, a mesma do detalhe e da lista de viagens, spec 259) em lote. Somar diária ×
 * dias aqui produziria dois números para a mesma viagem; o módulo Contas só lê e copia (ADR-0115).
 */
import { memoizeRule } from '../../trips/application/read-trip-revenue-totals.use-case.js'
import { buildValuationFromContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type { TripListFinancialsPort } from '../../trips/application/read-trip-list-financials.use-case.js'
import type { ExpenseOccurrenceTripPorts, PayableTripParcel } from '../application/expense.port.js'

type ReadPersonParcels = ExpenseOccurrenceTripPorts['payableTrips']['readPersonParcels']

/** Lacuna sem código (parcela `period`, salário fora da viagem): a viagem não tem valor a copiar. */
const UNPRICED_GAP = 'PARCEL_NOT_PRICED'

export function createTripPersonParcelReader(
  repository: TripListFinancialsPort,
): ReadPersonParcels {
  return async ({ companyId, driverId, parcelKind, tripIds }) => {
    const parcels = new Map<string, PayableTripParcel>()
    // A T1.4c (RF1e) lê a linha do ajudante; até lá só o condutor tem linha por pessoa na valoração.
    if (parcelKind !== 'driver' || tripIds.length === 0) return parcels

    const contexts = await repository.readValuationContexts({ companyId, tripIds })
    const rules = { findApplicableRule: memoizeRule(repository) }
    for (const tripId of tripIds) {
      const context = contexts.get(tripId)
      if (context === undefined) continue
      if (!(context.crew ?? []).some((member) => member.driverId === driverId)) continue
      const valuation = await buildValuationFromContext({ companyId, context, repository: rules })
      const parcel = valuation.costParcels.find((candidate) => candidate.kind === 'driver')
      if (parcel === undefined) continue
      if (
        parcel.source === 'missing' ||
        parcel.source === 'period' ||
        parcel.basis?.of !== 'driver'
      ) {
        parcels.set(tripId, { gap: parcel.gap ?? UNPRICED_GAP, status: 'missing' })
        continue
      }
      const line = parcel.basis.crew.find((member) => member.driverId === driverId)
      if (line === undefined) continue
      parcels.set(tripId, {
        amount: line.subtotal,
        dailyAmount: line.dailyAmount,
        days: parcel.basis.days,
        status: 'priced',
      })
    }
    return parcels
  }
}
