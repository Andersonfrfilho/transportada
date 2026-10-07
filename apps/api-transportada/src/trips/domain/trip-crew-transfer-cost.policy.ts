/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import {
  buildCrewCostParcels,
  summarizeCrewCost,
  type CrewCostSummary,
} from './trip-crew-cost.policy.js'
import type { TripCrewMember } from './trip-driver-cost.policy.js'
import type { TripHelperCostMember } from './trip-helper-cost.policy.js'
import type { TripCrewSlot } from './trip-crew-transfer.policy.js'

/** O que a ficha de uma pessoa da tripulação diz sobre a diária dela — o cru, sem resolver nada. */
export type CrewMemberRates = {
  /** `fleet_drivers.daily_allowance_amount`: o que o motorista recebe por dia. */
  readonly driverAmount: null | string
  /** `fleet_drivers.helper_daily_rate`: o que o ajudante recebe por dia. */
  readonly helperDailyRate: null | string
  readonly name: string
  readonly paymentModel: DriverPaymentModel
}

/**
 * Spec 249 D7: tudo o que a conta de tripulação lê, colhido **uma vez** sob o lock da viagem — as
 * fichas e as diárias da empresa valem para a tripulação de antes e a de depois, então a diferença
 * é só de quem está a bordo.
 */
export type CrewCostBasis = {
  readonly companyDailyAllowanceAmount: null | string
  readonly dailyAllowanceDays: null | number
  readonly estimatedDurationSeconds: null | number
  readonly helperCompanyDailyRate: null | string
  readonly journeyIncludesReturn: null | boolean
  readonly journeySeconds: null | number
  readonly ratesByDriverId: ReadonlyMap<string, CrewMemberRates>
}

/** Os insumos da viagem que a conta lê do `trips` — congelados quando o roteiro foi planejado. */
export type TripCrewCostFigures = Pick<
  CrewCostBasis,
  'dailyAllowanceDays' | 'estimatedDurationSeconds' | 'journeyIncludesReturn' | 'journeySeconds'
>

export type SummarizeRosterCostParams = {
  readonly basis: CrewCostBasis
  /** Na ordem de `position`, como `readCrew` entrega à avaliação da viagem. */
  readonly roster: readonly TripCrewSlot[]
}

/**
 * O custo de uma tripulação pela **mesma conta** da avaliação da viagem (`buildCrewCostParcels`),
 * montando os insumos como `readCrew`/`readHelperCrew` os montam: motorista paga pela diária de
 * motorista da ficha, ajudante pela de ajudante, e um papel nunca entra na conta do outro.
 */
export function summarizeRosterCost({ basis, roster }: SummarizeRosterCostParams): CrewCostSummary {
  const crew: TripCrewMember[] = []
  const helperCrew: TripHelperCostMember[] = []

  for (const slot of roster) {
    const rates = basis.ratesByDriverId.get(slot.driverId)
    if (rates === undefined) throw new Error('TRIP_CREW_COST_RATES_MISSING')
    if (slot.role === 'driver') {
      crew.push({
        driverAmount: rates.driverAmount,
        driverId: slot.driverId,
        driverName: rates.name,
        paymentModel: rates.paymentModel,
      })
    } else {
      helperCrew.push({ driverId: slot.driverId, ownDailyRate: rates.helperDailyRate })
    }
  }

  return summarizeCrewCost(
    buildCrewCostParcels({
      companyDailyAllowanceAmount: basis.companyDailyAllowanceAmount,
      crew,
      dailyAllowanceDays: basis.dailyAllowanceDays,
      estimatedDurationSeconds: basis.estimatedDurationSeconds,
      helperCompanyDailyRate: basis.helperCompanyDailyRate,
      helperCrew,
      journeyIncludesReturn: basis.journeyIncludesReturn,
      journeySeconds: basis.journeySeconds,
    }),
  )
}
