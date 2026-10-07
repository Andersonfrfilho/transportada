/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { companyCrewSettings } from '../../database/company-crew-settings.schema.js'
import { companyDriverAllowanceSettings } from '../../database/company-driver-allowance-settings.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import type {
  CrewCostBasis,
  CrewMemberRates,
  TripCrewCostFigures,
} from '../domain/trip-crew-transfer-cost.policy.js'
import type { TripTransaction } from './trip-queryable.type.js'

export type ReadCrewCostBasisParams = {
  readonly companyId: string
  /** Quem estava a bordo e quem vai estar: uma consulta só, nunca uma por pessoa. */
  readonly driverIds: readonly string[]
  /** Os insumos congelados no `trips`, lidos pelo chamador sob o mesmo lock. */
  readonly trip: TripCrewCostFigures
}

/**
 * Spec 249 D7: lê as fichas e as duas diárias da empresa **como `trip-valuation.query.ts` as lê**
 * (`readCrew`, `readHelperCrew`, `readHelperCompanyDailyRate`, `readCompanyDailyAllowanceAmount`),
 * mas dentro da transação e **em sequência**: o Bun SQL deixa uma transação ociosa quando consultas
 * disputam a conexão única dela (`Promise.all` aqui travaria a troca).
 */
export async function readCrewCostBasis(
  transaction: TripTransaction,
  { companyId, driverIds, trip }: ReadCrewCostBasisParams,
): Promise<CrewCostBasis> {
  const rows = await transaction
    .select({
      driverAmount: fleetDrivers.dailyAllowanceAmount,
      helperDailyRate: fleetDrivers.helperDailyRate,
      id: fleetDrivers.id,
      name: fleetDrivers.name,
      paymentModel: fleetDrivers.paymentModel,
    })
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.companyId, companyId), inArray(fleetDrivers.id, [...driverIds])))

  const [driverAllowance] = await transaction
    .select({ dailyAllowanceAmount: companyDriverAllowanceSettings.dailyAllowanceAmount })
    .from(companyDriverAllowanceSettings)
    .where(eq(companyDriverAllowanceSettings.companyId, companyId))
    .limit(1)

  const [crewSettings] = await transaction
    .select({ helperDailyRate: companyCrewSettings.helperDailyRate })
    .from(companyCrewSettings)
    .where(eq(companyCrewSettings.companyId, companyId))
    .limit(1)

  const ratesByDriverId = new Map<string, CrewMemberRates>(
    rows.map((row) => [
      row.id,
      {
        driverAmount: row.driverAmount,
        helperDailyRate: row.helperDailyRate,
        name: row.name,
        paymentModel: row.paymentModel,
      },
    ]),
  )

  return {
    ...trip,
    companyDailyAllowanceAmount: driverAllowance?.dailyAllowanceAmount ?? null,
    helperCompanyDailyRate: crewSettings?.helperDailyRate ?? null,
    ratesByDriverId,
  }
}
