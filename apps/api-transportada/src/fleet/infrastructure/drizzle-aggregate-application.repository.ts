/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import { aggregateApplications, fleetDrivers } from '../../database/database.schema.js'
import { AggregateApplicationNotFoundError } from '../domain/aggregate-application.error.js'
import type {
  AggregateApplication,
  AggregateApplicationRepositoryPort,
  AggregateApplicationSubmissionInput,
} from '../application/aggregate-applications.port.js'

export type AggregateApplicationDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleAggregateApplicationRepository(
  database: AggregateApplicationDatabase,
): AggregateApplicationRepositoryPort {
  return {
    async findById({ id }) {
      const [row] = await database
        .select()
        .from(aggregateApplications)
        .where(eq(aggregateApplications.id, id))
        .limit(1)
      return row === undefined ? null : toApplication(row)
    },

    async findDriverIdByTaxIdInCompanies({ companyIds, taxId }) {
      if (companyIds.length === 0) return null
      const [row] = await database
        .select({ id: fleetDrivers.id })
        .from(fleetDrivers)
        .where(and(inArray(fleetDrivers.companyId, [...companyIds]), eq(fleetDrivers.taxId, taxId)))
        .limit(1)
      return row?.id ?? null
    },

    async findPendingByCompanyAndTaxId({ companyId, taxId }) {
      const [row] = await database
        .select()
        .from(aggregateApplications)
        .where(
          and(
            eq(aggregateApplications.companyId, companyId),
            eq(aggregateApplications.taxId, taxId),
            eq(aggregateApplications.status, 'pending'),
          ),
        )
        .limit(1)
      return row === undefined ? null : toApplication(row)
    },

    async insert(input: AggregateApplicationSubmissionInput & { duplicateDriverId: string | null }) {
      const [row] = await database
        .insert(aggregateApplications)
        .values({
          companyId: input.companyId,
          declaredData: input.declaredData,
          duplicateDriverId: input.duplicateDriverId,
          email: input.email,
          name: input.name,
          phone: input.phone,
          taxId: input.taxId,
        })
        .returning()

      return toApplication(mustExist(row))
    },

    async listByCompany({ companyId }) {
      const rows = await database
        .select()
        .from(aggregateApplications)
        .where(eq(aggregateApplications.companyId, companyId))
      return rows.map(toApplication)
    },

    async updateResubmission({ declaredData, duplicateDriverId, email, id, name, phone }) {
      const [row] = await database
        .update(aggregateApplications)
        .set({
          declaredData,
          duplicateDriverId,
          latestSubmission: { declaredData, email, name, phone },
          resubmittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aggregateApplications.id, id))
        .returning()

      return toApplication(mustExist(row))
    },

    async approve({ driverId, id }) {
      const [row] = await database
        .update(aggregateApplications)
        .set({ driverId, reviewedAt: new Date(), status: 'approved', updatedAt: new Date() })
        .where(eq(aggregateApplications.id, id))
        .returning()

      return toApplication(mustExist(row))
    },

    async createDriverAndApprove({ companyId, id, name, taxId }) {
      return database.transaction(async (transaction) => {
        const [driver] = await transaction
          .insert(fleetDrivers)
          .values({ companyId, name, taxId })
          .returning({ id: fleetDrivers.id })

        const insertedDriver = mustExist(driver)
        const [row] = await transaction
          .update(aggregateApplications)
          .set({
            driverId: insertedDriver.id,
            reviewedAt: new Date(),
            status: 'approved',
            updatedAt: new Date(),
          })
          .where(eq(aggregateApplications.id, id))
          .returning()

        return toApplication(mustExist(row))
      })
    },

    async reject({ id, rejectionReason }) {
      const [row] = await database
        .update(aggregateApplications)
        .set({
          rejectionReason,
          reviewedAt: new Date(),
          status: 'rejected',
          updatedAt: new Date(),
        })
        .where(eq(aggregateApplications.id, id))
        .returning()

      return toApplication(mustExist(row))
    },
  }
}

function mustExist<TValue>(value: TValue | undefined): TValue {
  if (value === undefined) throw new AggregateApplicationNotFoundError()
  return value
}

function toApplication(row: typeof aggregateApplications.$inferSelect): AggregateApplication {
  return {
    companyId: row.companyId,
    createdAt: row.createdAt,
    declaredData: row.declaredData as Record<string, unknown>,
    driverId: row.driverId,
    duplicateDriverId: row.duplicateDriverId,
    email: row.email,
    id: row.id,
    latestSubmission: row.latestSubmission as Record<string, unknown> | null,
    name: row.name,
    phone: row.phone,
    rejectionReason: row.rejectionReason,
    resubmittedAt: row.resubmittedAt,
    reviewedAt: row.reviewedAt,
    status: row.status,
    taxId: row.taxId,
    updatedAt: row.updatedAt,
  }
}
