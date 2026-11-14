/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.5 (ADR-0116 §3): as viagens concluídas do período, com faturamento e custo da **única** conta de valoração
 * do produto (`buildValuationFromContext`, a mesma do detalhe e da lista de viagens, spec 259). A data de conclusão é a
 * mesma do pagamento (`completedOnSql`, T1.4b): a viagem concluída pelo relatório do motorista não grava `closed_at`, e
 * ler só ele a deixaria fora do resultado do mês.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { trips } from '../../database/trip.schema.js'
import { memoizeRule } from '../../trips/application/read-trip-revenue-totals.use-case.js'
import { buildValuationFromContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type { TripListFinancialsPort } from '../../trips/application/read-trip-list-financials.use-case.js'
import type { TripValuationContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type { ExpenseResultPorts } from '../application/expense-result.port.js'
import { NO_CUSTOMER_ID, NO_VEHICLE_ID } from '../domain/expense-result-filters.policy.js'
import { pickTripCustomerTaxId } from '../domain/expense-trip-customer.policy.js'
import { completedOnSql, readTripRoutes } from './payable-trip.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Viagem sem veículo (ou cliente sem cadastro) não some do resultado: vira uma linha com este identificador. */
export { NO_CUSTOMER_ID, NO_VEHICLE_ID }

const SECONDS_PER_DAY = 86_400

/** `numeric(19,4)` da valoração → duas casas, meio para cima (a mesma convenção do rateio). */
export function roundMoneyToCents(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (match?.[2] === undefined) throw new Error(`allocation trip: invalid money "${value}"`)
  const fraction = (match[3] ?? '').padEnd(3, '0')
  let cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2))
  if (fraction.charCodeAt(2) >= 53) cents += 1n
  const whole = (cents / 100n).toString()
  return `${match[1] ?? ''}${whole}.${(cents % 100n).toString().padStart(2, '0')}`
}

/** Dias da viagem: os informados; senão a duração estimada em dias cheios; no mínimo um. */
function daysOf(context: TripValuationContext): number {
  const informed = context.dailyAllowanceDays
  if (informed !== null && informed !== undefined && informed > 0) return informed
  const seconds = context.estimatedDurationSeconds
  if (seconds !== null && seconds !== undefined && seconds > 0) {
    return Math.max(1, Math.ceil(seconds / SECONDS_PER_DAY))
  }
  return 1
}

export function createAllocationTripQuery(
  database: Database,
  financials: TripListFinancialsPort,
): ExpenseResultPorts['trips'] {
  return {
    listCompleted: async ({ companyId, from, to }) => {
      const rows = await database
        .select({ completedOn: completedOnSql, tripId: trips.id, vehicleId: trips.vehicleId })
        .from(trips)
        .where(
          and(
            eq(trips.companyId, companyId),
            eq(trips.status, 'completed'),
            sql`${completedOnSql} between ${from} and ${to}`,
          ),
        )
      if (rows.length === 0) return []

      const tripIds = rows.map((row) => row.tripId)
      const contexts = await financials.readValuationContexts({ companyId, tripIds })
      const repository = { findApplicableRule: memoizeRule(financials) }

      const valued = new Map<
        string,
        {
          context: TripValuationContext
          customerTaxId: null | string
          cost: string
          revenue: string
        }
      >()
      for (const tripId of tripIds) {
        const context = contexts.get(tripId)
        if (context === undefined) continue
        const valuation = await buildValuationFromContext({ companyId, context, repository })
        valued.set(tripId, {
          context,
          cost: roundMoneyToCents(valuation.totalCost),
          customerTaxId: pickTripCustomerTaxId(context.documents, valuation.revenueLines),
          revenue: roundMoneyToCents(valuation.totalRevenue),
        })
      }

      const taxIds = [...new Set([...valued.values()].flatMap((v) => v.customerTaxId ?? []))]
      const customerByTaxId = new Map<string, string>()
      if (taxIds.length > 0) {
        const found = await database
          .select({ id: contractors.id, taxId: contractors.taxId })
          .from(contractors)
          .where(and(eq(contractors.companyId, companyId), inArray(contractors.taxId, taxIds)))
        for (const contractor of found) customerByTaxId.set(contractor.taxId, contractor.id)
      }

      const routes = await readTripRoutes(database, { companyId, tripIds })

      return rows.flatMap((row) => {
        const trip = valued.get(row.tripId)
        if (trip === undefined) return []
        return [
          {
            completedOn: row.completedOn,
            cost: trip.cost,
            customerId:
              (trip.customerTaxId === null ? undefined : customerByTaxId.get(trip.customerTaxId)) ??
              NO_CUSTOMER_ID,
            daysCount: daysOf(trip.context),
            distanceMeters: trip.context.distanceMeters ?? 0,
            revenue: trip.revenue,
            route: routes.get(row.tripId) ?? null,
            tripId: row.tripId,
            vehicleId: row.vehicleId ?? NO_VEHICLE_ID,
          },
        ]
      })
    },
  }
}
