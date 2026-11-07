/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.5: as fontes do canal. Grupo = `max(whatsapp_group_requests.last_activity_at)` do grupo do motorista
 * (toda mensagem aceita no grupo abre ou entra num pedido); individual = `last_inbound_at` da sessão da Meta. Toda
 * consulta leva `companyId`.
 */
import { and, eq, max } from 'drizzle-orm'

import { fleetDriverWhatsappGroups, fleetDrivers } from '../../database/fleet.schema.js'
import { whatsappGroupRequests } from '../../database/whatsapp-group-request.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { sessionPhoneCandidates } from '../../whatsapp-commands/infrastructure/driver-open-question.adapter.js'
import type { DriverReminderChannelResolver } from '../application/driver-reminder-channel-resolver.port.js'
import { createDriverReminderChannelResolver } from '../application/driver-reminder-channel-resolver.service.js'

type SessionReader = {
  getContext(
    companyId: string,
    whatsappNumber: string,
  ): Promise<{ readonly lastInboundAt: Date | null } | undefined>
}

export function createDrizzleDriverReminderChannelResolver(dependencies: {
  readonly database: TripQueryable
  readonly sessions: SessionReader
}): DriverReminderChannelResolver {
  const { database } = dependencies
  return createDriverReminderChannelResolver({
    readContact: async ({ companyId, driverId }) => {
      const [driver] = await database
        .select({ phone: fleetDrivers.phone })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.id, driverId)))
        .limit(1)
      const [group] = await database
        .select({ groupJid: fleetDriverWhatsappGroups.groupJid })
        .from(fleetDriverWhatsappGroups)
        .where(
          and(
            eq(fleetDriverWhatsappGroups.companyId, companyId),
            eq(fleetDriverWhatsappGroups.driverId, driverId),
          ),
        )
        .limit(1)
      return {
        groupJid: group?.groupJid,
        phone: driver === undefined || driver.phone === '' ? undefined : driver.phone,
      }
    },
    readLastDirectInboundAt: async ({ companyId, phone }) => {
      const sessions = await Promise.all(
        sessionPhoneCandidates(phone).map((candidate) =>
          dependencies.sessions.getContext(companyId, candidate),
        ),
      )
      const moments = sessions.flatMap((session) => session?.lastInboundAt ?? [])
      return moments.length === 0 ? undefined : new Date(Math.max(...moments.map(Number)))
    },
    readLastGroupActivityAt: async ({ companyId, groupJid }) => {
      const [row] = await database
        .select({ lastActivityAt: max(whatsappGroupRequests.lastActivityAt) })
        .from(whatsappGroupRequests)
        .where(
          and(
            eq(whatsappGroupRequests.companyId, companyId),
            eq(whatsappGroupRequests.groupJid, groupJid),
          ),
        )
      return row?.lastActivityAt ?? undefined
    },
  })
}
