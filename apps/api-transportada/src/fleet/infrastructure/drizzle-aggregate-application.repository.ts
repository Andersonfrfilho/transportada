/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import {
  aggregateApplicationAttachments,
  aggregateApplications,
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
} from '../../database/database.schema.js'
import { AggregateApplicationNotFoundError } from '../domain/aggregate-application.error.js'
import {
  hasDeclaredVehicle,
  mapDeclaredDataToDriverInput,
  mapDeclaredDataToVehicleInput,
  resolveVehicleOwnerFields,
  type AggregateApplicationDeclaredData,
} from '../domain/aggregate-application-driver-mapping.policy.js'
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

    async insert(
      input: AggregateApplicationSubmissionInput & { duplicateDriverId: string | null },
    ) {
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

    /**
     * A segurança está no `where`, não em quem chama: só rascunho **desta empresa** e ainda **sem
     * candidatura** é amarrado. Rascunho de outra empresa, inexistente ou já vinculado não casa
     * linha nenhuma — e não vira erro, porque o submit é `202` invariável e diferenciar aqui
     * devolveria a sonda de identificadores que o `202` fecha.
     */
    async linkAttachmentDrafts({ applicationId, companyId, draftIds }) {
      if (draftIds.length === 0) return

      await database
        .update(aggregateApplicationAttachments)
        .set({ applicationId, updatedAt: new Date() })
        .where(
          and(
            eq(aggregateApplicationAttachments.companyId, companyId),
            isNull(aggregateApplicationAttachments.applicationId),
            inArray(aggregateApplicationAttachments.draftId, [...draftIds]),
          ),
        )
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

    async createDriverAndApprove({ companyId, declaredData, email, id, name, phone, taxId }) {
      const declared = declaredData as AggregateApplicationDeclaredData
      const driverInput = mapDeclaredDataToDriverInput({
        declaredData: declared,
        email,
        name,
        phone,
        taxId,
      })

      return database.transaction(async (transaction) => {
        const [driver] = await transaction
          .insert(fleetDrivers)
          .values({ companyId, ...driverInput })
          .returning({ id: fleetDrivers.id })

        const insertedDriver = mustExist(driver)

        // Sem placa declarada, o operador cadastra o veículo depois — a ficha do motorista já é
        // válida sozinha, e o veículo do agregado troca de mãos com mais frequência que a CNH dele.
        if (hasDeclaredVehicle(declared.vehicle)) {
          const vehicleInput = mapDeclaredDataToVehicleInput(
            declared.vehicle ?? {},
            driverInput.state,
          )
          const ownerFields = resolveVehicleOwnerFields({ driver: driverInput, name, taxId })
          const [vehicle] = await transaction
            .insert(fleetVehicles)
            .values({ companyId, ...vehicleInput, ...ownerFields })
            .returning({ id: fleetVehicles.id })

          const insertedVehicle = mustExist(vehicle)
          await transaction.insert(fleetDriverVehicleAssignments).values({
            companyId,
            driverId: insertedDriver.id,
            vehicleId: insertedVehicle.id,
          })
        }

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
