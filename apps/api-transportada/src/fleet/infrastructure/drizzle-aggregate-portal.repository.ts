/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  aggregateAccounts,
  aggregateApplications,
  fleetDrivers,
} from '../../database/database.schema.js'
import type { AggregatePortalRepositoryPort } from '../application/aggregate-portal.port.js'

export type AggregatePortalDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleAggregatePortalRepository(
  database: AggregatePortalDatabase,
): AggregatePortalRepositoryPort {
  return {
    async findAccountByUserId({ userId }) {
      const [row] = await database
        .select({ companyId: aggregateAccounts.companyId, taxId: aggregateAccounts.taxId })
        .from(aggregateAccounts)
        .where(eq(aggregateAccounts.userId, userId))
        .limit(1)
      return row ?? null
    },

    async findApplication({ companyId, taxId }) {
      const [row] = await database
        .select({
          rejectionReason: aggregateApplications.rejectionReason,
          status: aggregateApplications.status,
        })
        .from(aggregateApplications)
        .where(
          and(
            eq(aggregateApplications.companyId, companyId),
            eq(aggregateApplications.taxId, taxId),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async findDriverProfile({ companyId, taxId }) {
      const [row] = await database
        .select({
          city: fleetDrivers.city,
          complement: fleetDrivers.complement,
          district: fleetDrivers.district,
          email: fleetDrivers.email,
          name: fleetDrivers.name,
          number: fleetDrivers.number,
          phone: fleetDrivers.phone,
          postalCode: fleetDrivers.postalCode,
          state: fleetDrivers.state,
          street: fleetDrivers.street,
        })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.taxId, taxId)))
        .limit(1)
      if (row === undefined) return null

      const { city, complement, district, number, postalCode, state, street, ...rest } = row
      return { ...rest, address: { city, complement, district, number, postalCode, state, street } }
    },
  }
}
