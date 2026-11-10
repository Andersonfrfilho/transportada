/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  fleetDrivers,
  fleetDriverWhatsappGroups,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import {
  findWhatsappGroupContractorOwner,
  lockWhatsappGroupIdentity,
} from '../../database/whatsapp-group-identity.support.js'
import type {
  DriverWhatsappGroup,
  DriverWhatsappGroupActor,
  DriverWhatsappGroupAssignment,
  DriverWhatsappGroupRepositoryPort,
} from '../application/driver-whatsapp-group.port.js'
import {
  FleetDriverNotFoundError,
  FleetDriverWhatsappGroupTakenByContractorError,
  FleetDriverWhatsappGroupTakenError,
} from '../domain/fleet.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ENTITY_TYPE = 'fleet_driver_whatsapp_group'
const GROUP_UNIQUE = 'fleet_driver_whatsapp_groups_company_group_unique'

export class DrizzleDriverWhatsappGroupRepository implements DriverWhatsappGroupRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async find(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverWhatsappGroup | null> {
    const [row] = await this.database
      .select({
        groupJid: fleetDriverWhatsappGroups.groupJid,
        groupName: fleetDriverWhatsappGroups.groupName,
        updatedAt: fleetDriverWhatsappGroups.updatedAt,
      })
      .from(fleetDriverWhatsappGroups)
      .where(
        and(
          eq(fleetDriverWhatsappGroups.companyId, input.companyId),
          eq(fleetDriverWhatsappGroups.driverId, input.driverId),
        ),
      )
      .limit(1)
    return row === undefined ? null : { ...row, updatedAt: row.updatedAt.toISOString() }
  }

  /**
   * Spec 292 T3: a lista de permissão do webhook. O motorista dono do grupo nesta empresa, ou `null`;
   * o mesmo `@g.us` em outra empresa não conta (a chave única é por empresa).
   */
  public async findDriverByGroup(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<null | { readonly driverId: string }> {
    const [row] = await this.database
      .select({ driverId: fleetDriverWhatsappGroups.driverId })
      .from(fleetDriverWhatsappGroups)
      .where(
        and(
          eq(fleetDriverWhatsappGroups.companyId, input.companyId),
          eq(fleetDriverWhatsappGroups.groupJid, input.groupJid),
        ),
      )
      .limit(1)
    return row ?? null
  }

  public async listAssignments(input: {
    readonly companyId: string
  }): Promise<readonly DriverWhatsappGroupAssignment[]> {
    return this.database
      .select({
        driverId: fleetDriverWhatsappGroups.driverId,
        driverName: fleetDrivers.name,
        groupJid: fleetDriverWhatsappGroups.groupJid,
      })
      .from(fleetDriverWhatsappGroups)
      .innerJoin(
        fleetDrivers,
        and(
          eq(fleetDrivers.companyId, fleetDriverWhatsappGroups.companyId),
          eq(fleetDrivers.id, fleetDriverWhatsappGroups.driverId),
        ),
      )
      .where(eq(fleetDriverWhatsappGroups.companyId, input.companyId))
  }

  public async remove(input: DriverWhatsappGroupActor): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const deleted = await transaction
        .delete(fleetDriverWhatsappGroups)
        .where(
          and(
            eq(fleetDriverWhatsappGroups.companyId, input.companyId),
            eq(fleetDriverWhatsappGroups.driverId, input.driverId),
          ),
        )
        .returning({
          groupJid: fleetDriverWhatsappGroups.groupJid,
          id: fleetDriverWhatsappGroups.id,
        })
      const [row] = deleted
      if (row === undefined) return false
      await transaction.insert(auditLogs).values({
        action: 'fleet-driver.whatsapp-group.removed',
        actorUserId: input.actorUserId,
        afterSnapshot: null,
        beforeSnapshot: { groupJid: row.groupJid },
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.driverId,
        entityType: ENTITY_TYPE,
        permission: 'fleet.manage',
        targetId: input.driverId,
        targetType: ENTITY_TYPE,
      })
      return true
    })
  }

  public async set(
    input: DriverWhatsappGroupActor & { readonly groupJid: string; readonly groupName: string },
  ): Promise<DriverWhatsappGroup> {
    try {
      return await this.database.transaction(async (transaction) => {
        // Trava a ficha: duas trocas simultâneas da mesma ficha se enfileiram.
        const [driver] = await transaction
          .select({ id: fleetDrivers.id })
          .from(fleetDrivers)
          .where(
            and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)),
          )
          .for('update')
          .limit(1)
        if (driver === undefined) throw new FleetDriverNotFoundError()

        // Spec 318 RF5: o grupo da contratante também é identidade; a trava serializa com a escrita do canal dela.
        await lockWhatsappGroupIdentity(transaction, input)
        if ((await findWhatsappGroupContractorOwner(transaction, input)) !== null) {
          throw new FleetDriverWhatsappGroupTakenByContractorError()
        }

        const [owner] = await transaction
          .select({ driverId: fleetDriverWhatsappGroups.driverId })
          .from(fleetDriverWhatsappGroups)
          .where(
            and(
              eq(fleetDriverWhatsappGroups.companyId, input.companyId),
              eq(fleetDriverWhatsappGroups.groupJid, input.groupJid),
            ),
          )
          .limit(1)
        if (owner !== undefined && owner.driverId !== input.driverId) {
          throw new FleetDriverWhatsappGroupTakenError()
        }

        const [previous] = await transaction
          .select({ groupJid: fleetDriverWhatsappGroups.groupJid })
          .from(fleetDriverWhatsappGroups)
          .where(
            and(
              eq(fleetDriverWhatsappGroups.companyId, input.companyId),
              eq(fleetDriverWhatsappGroups.driverId, input.driverId),
            ),
          )
          .limit(1)

        const now = new Date()
        const [row] = await transaction
          .insert(fleetDriverWhatsappGroups)
          .values({
            companyId: input.companyId,
            driverId: input.driverId,
            groupJid: input.groupJid,
            groupName: input.groupName,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: { groupJid: input.groupJid, groupName: input.groupName, updatedAt: now },
            target: [fleetDriverWhatsappGroups.companyId, fleetDriverWhatsappGroups.driverId],
          })
          .returning({
            groupJid: fleetDriverWhatsappGroups.groupJid,
            groupName: fleetDriverWhatsappGroups.groupName,
            updatedAt: fleetDriverWhatsappGroups.updatedAt,
          })
        if (row === undefined) throw new Error('driver whatsapp group upsert returned no row')

        await transaction.insert(auditLogs).values({
          action: 'fleet-driver.whatsapp-group.set',
          actorUserId: input.actorUserId,
          afterSnapshot: { groupJid: input.groupJid },
          beforeSnapshot: previous === undefined ? null : { groupJid: previous.groupJid },
          companyId: input.companyId,
          correlationId: input.correlationId,
          entityId: input.driverId,
          entityType: ENTITY_TYPE,
          permission: 'fleet.manage',
          targetId: input.driverId,
          targetType: ENTITY_TYPE,
        })
        return { ...row, updatedAt: row.updatedAt.toISOString() }
      })
    } catch (error) {
      // Corrida entre duas fichas pelo mesmo grupo: o unique do banco decide.
      if (violatedUniqueConstraint(error) === GROUP_UNIQUE) {
        throw new FleetDriverWhatsappGroupTakenError()
      }
      throw error
    }
  }
}
