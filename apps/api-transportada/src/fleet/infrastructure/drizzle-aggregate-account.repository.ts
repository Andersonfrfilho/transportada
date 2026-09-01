/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import {
  aggregateAccounts,
  aggregateApplications,
  fleetDrivers,
} from '../../database/database.schema.js'
import type { AggregateAccountRepositoryPort } from '../application/aggregate-account.port.js'

export type AggregateAccountDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleAggregateAccountRepository(
  database: AggregateAccountDatabase,
): AggregateAccountRepositoryPort {
  return {
    async findEligibleTaxId({ companyIds, taxId }) {
      if (companyIds.length === 0) return null

      const [driverRow] = await database
        .select({ companyId: fleetDrivers.companyId })
        .from(fleetDrivers)
        .where(and(inArray(fleetDrivers.companyId, [...companyIds]), eq(fleetDrivers.taxId, taxId)))
        .limit(1)
      if (driverRow !== undefined) return { companyId: driverRow.companyId, taxId }

      const [applicationRow] = await database
        .select({ companyId: aggregateApplications.companyId })
        .from(aggregateApplications)
        .where(
          and(
            inArray(aggregateApplications.companyId, [...companyIds]),
            eq(aggregateApplications.taxId, taxId),
          ),
        )
        .limit(1)
      return applicationRow === undefined ? null : { companyId: applicationRow.companyId, taxId }
    },

    async isTaxIdLinked({ companyId, taxId }) {
      const [row] = await database
        .select({ id: aggregateAccounts.id })
        .from(aggregateAccounts)
        .where(and(eq(aggregateAccounts.companyId, companyId), eq(aggregateAccounts.taxId, taxId)))
        .limit(1)
      return row !== undefined
    },

    async link({ companyId, taxId, userId }) {
      await database.insert(aggregateAccounts).values({ companyId, taxId, userId })
    },
  }
}
