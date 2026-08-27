/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gte, lte, sql, sum } from 'drizzle-orm'

import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { tripFinancialResults } from '../../database/trip-financial.schema.js'
import { tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  FinancialSummaryGroup,
  FinancialSummaryRow,
} from '../domain/financial-summary.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type FinancialSummaryFilters = {
  readonly companyId: string
  readonly from: string
  readonly groupBy: FinancialSummaryGroup
  readonly to: string
}

/**
 * Spec 061 D5: **consulta sobre os resultados congelados**, não tabela de agregação mantida em
 * paralelo — que dessincroniza. Se doer em volume, materializa-se depois, e aí com número na mão.
 *
 * Só a versão viva entra: as anteriores são histórico do recálculo, e somá-las contaria a mesma
 * viagem duas vezes.
 */
export class DrizzleFinancialSummaryQuery {
  public constructor(private readonly database: Database) {}

  public async listGroups(
    filters: FinancialSummaryFilters,
  ): Promise<readonly FinancialSummaryRow[]> {
    if (filters.groupBy === 'driver') return this.listByDriver(filters)
    if (filters.groupBy === 'vehicle') return this.listByVehicle(filters)

    return this.listByPeriod(filters)
  }

  /**
   * ADR-0049 §3: a folha do período. Ela desce **uma vez** do acumulado, e nunca das viagens — o
   * salário é custo do período, e ratear por viagem nasceria errado.
   *
   * `null` quando não há assalariado na frota: aí não há folha a descontar, e a diferença entre isso
   * e "folha zero" é o que o acumulado mostra ao lado do número.
   */
  public async readPayroll(input: {
    readonly companyId: string
    readonly from: string
    readonly to: string
  }): Promise<null | string> {
    const [row] = await this.database
      .select({
        monthly: sum(
          sql`case when ${fleetDrivers.paymentPeriod} = 'monthly' then ${fleetDrivers.fixedAmount} else 0 end`,
        ),
        fortnightly: sum(
          sql`case when ${fleetDrivers.paymentPeriod} = 'fortnightly' then ${fleetDrivers.fixedAmount} else 0 end`,
        ),
      })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          eq(fleetDrivers.paymentModel, 'fixed'),
          eq(fleetDrivers.status, 'active'),
        ),
      )
    if (row === undefined || (row.monthly === null && row.fortnightly === null)) return null

    /**
     * Quantos fechamentos cabem na janela. A quinzena fecha duas vezes por mês, e é isso que o fator
     * traduz — sem ele, um mês de folha entraria como meia num relatório mensal.
     */
    const months = countMonths({ from: input.from, to: input.to })
    const monthly = toScaled(row.monthly ?? '0') * BigInt(months)
    const fortnightly = toScaled(row.fortnightly ?? '0') * BigInt(months) * 2n

    return format(monthly + fortnightly)
  }

  private async listByPeriod(
    filters: FinancialSummaryFilters,
  ): Promise<readonly FinancialSummaryRow[]> {
    const month = sql<string>`to_char(${tripFinancialResults.frozenAt}, 'YYYY-MM')`

    const rows = await this.database
      .select({
        ...totals(),
        groupId: month,
        groupLabel: month,
      })
      .from(tripFinancialResults)
      .where(and(...periodFilters(filters)))
      .groupBy(month)

    return rows.map(toRow)
  }

  private async listByVehicle(
    filters: FinancialSummaryFilters,
  ): Promise<readonly FinancialSummaryRow[]> {
    const rows = await this.database
      .select({
        ...totals(),
        groupId: fleetVehicles.id,
        groupLabel: fleetVehicles.plate,
      })
      .from(tripFinancialResults)
      .innerJoin(
        trips,
        and(
          eq(trips.companyId, tripFinancialResults.companyId),
          eq(trips.id, tripFinancialResults.tripId),
        ),
      )
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(...periodFilters(filters)))
      .groupBy(fleetVehicles.id, fleetVehicles.plate)

    return rows.map(toRow)
  }

  /**
   * Viagem com dois condutores aparece nos dois grupos, com o **valor inteiro** em cada um — e a
   * contagem de viagens diz isso. Ratear a receita entre eles inventaria uma atribuição que a
   * operação não faz: o que se pergunta aqui é "quanto de faturamento passou pela mão de cada um".
   */
  private async listByDriver(
    filters: FinancialSummaryFilters,
  ): Promise<readonly FinancialSummaryRow[]> {
    const rows = await this.database
      .select({
        ...totals(),
        groupId: fleetDrivers.id,
        groupLabel: fleetDrivers.name,
      })
      .from(tripFinancialResults)
      .innerJoin(
        tripDrivers,
        and(
          eq(tripDrivers.companyId, tripFinancialResults.companyId),
          eq(tripDrivers.tripId, tripFinancialResults.tripId),
        ),
      )
      .innerJoin(
        fleetDrivers,
        and(
          eq(fleetDrivers.companyId, tripDrivers.companyId),
          eq(fleetDrivers.id, tripDrivers.driverId),
        ),
      )
      .where(and(...periodFilters(filters)))
      .groupBy(fleetDrivers.id, fleetDrivers.name)

    return rows.map(toRow)
  }
}

function totals() {
  return {
    costTotal: sum(tripFinancialResults.costTotal),
    isComplete: sql<boolean>`bool_and(${tripFinancialResults.isComplete})`,
    revenueAmount: sum(tripFinancialResults.revenueAmount),
    taxTotal: sum(tripFinancialResults.taxTotal),
    tripCount: sql<string>`count(*)::text`,
  }
}

function periodFilters(filters: FinancialSummaryFilters) {
  return [
    eq(tripFinancialResults.companyId, filters.companyId),
    eq(tripFinancialResults.isCurrent, true),
    gte(tripFinancialResults.frozenAt, new Date(`${filters.from}T00:00:00.000Z`)),
    lte(tripFinancialResults.frozenAt, new Date(`${filters.to}T23:59:59.999Z`)),
  ]
}

function toRow(row: {
  readonly costTotal: null | string
  readonly groupId: null | string
  readonly groupLabel: null | string
  readonly isComplete: boolean | null
  readonly revenueAmount: null | string
  readonly taxTotal: null | string
  readonly tripCount: string
}): FinancialSummaryRow {
  const revenue = toScaled(row.revenueAmount ?? '0')
  const tax = toScaled(row.taxTotal ?? '0')
  const cost = toScaled(row.costTotal ?? '0')

  return {
    costTotal: format(cost),
    groupId: row.groupId ?? '',
    groupLabel: row.groupLabel ?? '',
    isComplete: row.isComplete ?? false,
    netAmount: format(revenue - tax - cost),
    revenueAmount: format(revenue),
    taxTotal: format(tax),
    tripCount: Number(row.tripCount),
  }
}

function countMonths(input: { readonly from: string; readonly to: string }): number {
  const [fromYear = '0', fromMonth = '1'] = input.from.split('-')
  const [toYear = '0', toMonth = '1'] = input.to.split('-')

  return (Number(toYear) - Number(fromYear)) * 12 + (Number(toMonth) - Number(fromMonth)) + 1
}

function toScaled(value: string): bigint {
  const [integer = '0', fraction = ''] = value.split('.')
  const negative = integer.startsWith('-')

  return (
    (negative ? -1n : 1n) * BigInt(`${integer.replace('-', '')}${`${fraction}0000`.slice(0, 4)}`)
  )
}

function format(value: bigint): string {
  const negative = value < 0n
  const magnitude = (negative ? -value : value).toString().padStart(5, '0')

  return `${negative ? '-' : ''}${magnitude.slice(0, -4)}.${magnitude.slice(-4)}`
}
