/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1d (T1.4b): a linha da pessoa na parcela de pessoal da viagem, lida da **única** conta de valoração do
 * produto (`buildValuationFromContext`, a mesma do detalhe e da lista de viagens, spec 259) em lote. Somar diária ×
 * dias aqui produziria dois números para a mesma viagem; o módulo Contas só lê e copia (ADR-0115).
 *
 * T1.4c (RF1e): o ajudante lê a linha dele na parcela `helper` (149 D7) do mesmo jeito; cada parcela é lida só para
 * o papel que a pessoa teve na viagem, então a mesma viagem nunca entra duas vezes para a mesma pessoa.
 */
import { memoizeRule } from '../../trips/application/read-trip-revenue-totals.use-case.js'
import { buildValuationFromContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type { TripListFinancialsPort } from '../../trips/application/read-trip-list-financials.use-case.js'
import type { TripValuationContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type { TripCostParcel } from '../../trips/domain/trip-valuation.policy.js'
import type {
  ExpenseOccurrenceTripPorts,
  ExpenseTripParcelKind,
  PayableTripParcel,
} from '../application/expense.port.js'

type ReadPersonParcels = ExpenseOccurrenceTripPorts['payableTrips']['readPersonParcels']

/** Lacuna sem código (parcela `period`, salário fora da viagem): a viagem não tem valor a copiar. */
const UNPRICED_GAP = 'PARCEL_NOT_PRICED'

export function createTripPersonParcelReader(
  repository: TripListFinancialsPort,
): ReadPersonParcels {
  return async ({ companyId, driverId, parcelKind, tripIds }) => {
    const parcels = new Map<string, PayableTripParcel>()
    if (tripIds.length === 0) return parcels

    const contexts = await repository.readValuationContexts({ companyId, tripIds })
    const rules = { findApplicableRule: memoizeRule(repository) }
    for (const tripId of tripIds) {
      const context = contexts.get(tripId)
      if (context === undefined) continue
      if (!isCrewMember({ context, driverId, parcelKind })) continue
      const valuation = await buildValuationFromContext({ companyId, context, repository: rules })
      const parcel = valuation.costParcels.find((candidate) => candidate.kind === parcelKind)
      if (parcel === undefined) continue
      const found = readPersonLine({ driverId, parcel, parcelKind })
      if (found !== null) parcels.set(tripId, found)
    }
    return parcels
  }
}

/**
 * O condutor está em `crew` (`role = 'driver'`) e o ajudante em `helperCrew` (`role = 'helper'`, spec 149): cada
 * parcela olha só a própria lista, então a mesma pessoa nunca é lida pelas duas.
 */
function isCrewMember(input: {
  readonly context: TripValuationContext
  readonly driverId: string
  readonly parcelKind: ExpenseTripParcelKind
}): boolean {
  const members =
    input.parcelKind === 'helper' ? (input.context.helperCrew ?? []) : (input.context.crew ?? [])
  return members.some((member) => member.driverId === input.driverId)
}

/**
 * A linha da pessoa na parcela, copiada como a valoração a calculou (`basis.crew`, uma linha por pessoa, `Σ = amount`).
 * Parcela sem número (`missing`/`period`) ou pessoa sem linha nela (ajudante sem diária, quando outro ajudante tem)
 * vira pendência com o código da lacuna — nunca valor inventado.
 */
function readPersonLine(input: {
  readonly driverId: string
  readonly parcel: TripCostParcel
  readonly parcelKind: ExpenseTripParcelKind
}): null | PayableTripParcel {
  const { driverId, parcel, parcelKind } = input
  const missing: PayableTripParcel = { gap: parcel.gap ?? UNPRICED_GAP, status: 'missing' }
  if (parcel.source === 'missing' || parcel.source === 'period') return missing
  const basis = parcel.basis
  if (basis === null || basis === undefined || basis.of !== parcelKind) return missing
  if (basis.of !== 'driver' && basis.of !== 'helper') return missing
  const line = basis.crew.find((member) => member.driverId === driverId)
  if (line === undefined) return parcelKind === 'helper' ? missing : null
  return {
    amount: line.subtotal,
    dailyAmount: line.dailyAmount,
    days: basis.days,
    status: 'priced',
  }
}
