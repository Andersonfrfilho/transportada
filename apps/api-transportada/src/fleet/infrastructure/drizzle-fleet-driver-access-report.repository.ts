/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import { userInvitations } from '../../database/user-invitation.schema.js'
import type {
  FleetDriverAccessReportPort,
  FleetDriverAccessSource,
} from '../application/fleet-driver-access-report.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleFleetDriverAccessReportRepository(
  database: Database,
): FleetDriverAccessReportPort {
  return {
    async listActiveDrivers({ companyId }) {
      const drivers = await database
        .select({
          driverId: fleetDrivers.id,
          email: fleetDrivers.email,
          membershipId: fleetDrivers.membershipId,
          name: fleetDrivers.name,
          phone: fleetDrivers.phone,
          taxId: fleetDrivers.taxId,
        })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.status, 'active')))

      const membershipIds = drivers.flatMap((driver) =>
        driver.membershipId === null ? [] : [driver.membershipId],
      )
      const memberships =
        membershipIds.length === 0
          ? []
          : await database
              .select({ id: userCompanyMemberships.id, userId: userCompanyMemberships.userId })
              .from(userCompanyMemberships)
              .where(
                and(
                  eq(userCompanyMemberships.companyId, companyId),
                  inArray(userCompanyMemberships.id, membershipIds),
                ),
              )
      const userIdByMembership = new Map(memberships.map((row) => [row.id, row.userId]))

      const userIds = [...userIdByMembership.values()]
      const invitations =
        userIds.length === 0
          ? []
          : await database
              .select({
                acceptedAt: userInvitations.acceptedAt,
                deliveredAt: userInvitations.deliveredAt,
                expiresAt: userInvitations.expiresAt,
                status: userInvitations.status,
                userId: userInvitations.userId,
              })
              .from(userInvitations)
              .where(
                and(
                  eq(userInvitations.companyId, companyId),
                  inArray(userInvitations.userId, userIds),
                ),
              )
              .orderBy(desc(userInvitations.createdAt))
      /** Ordenado do mais novo ao mais velho: a primeira de cada usuário é a vigente. */
      const latestByUser = new Map<string, (typeof invitations)[number]>()
      for (const invitation of invitations) {
        if (!latestByUser.has(invitation.userId)) latestByUser.set(invitation.userId, invitation)
      }

      return drivers.map((driver): FleetDriverAccessSource => {
        const userId =
          driver.membershipId === null
            ? null
            : (userIdByMembership.get(driver.membershipId) ?? null)
        const latest = userId === null ? undefined : latestByUser.get(userId)
        return {
          driverId: driver.driverId,
          email: driver.email,
          invitation:
            latest === undefined
              ? null
              : {
                  acceptedAt: latest.acceptedAt,
                  deliveredAt: latest.deliveredAt,
                  expiresAt: latest.expiresAt,
                  status: latest.status,
                },
          name: driver.name,
          phone: driver.phone,
          taxId: driver.taxId,
          userId,
        }
      })
    },
  }
}
