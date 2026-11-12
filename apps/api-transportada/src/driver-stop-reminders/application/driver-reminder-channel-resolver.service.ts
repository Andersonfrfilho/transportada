/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.5 (D5, T0.1): compara a última mensagem de **entrada** do motorista em cada canal de WhatsApp. O mais
 * recente vence; empate ou nenhuma entrada valem grupo. O uso do app não é fonte.
 */
import type {
  DriverReminderChannelKind,
  DriverReminderChannelResolver,
} from './driver-reminder-channel-resolver.port.js'

export type DriverReminderChannelSources = {
  readContact(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly groupJid?: string | undefined; readonly phone?: string | undefined }>
  readLastDirectInboundAt(input: {
    readonly companyId: string
    readonly phone: string
  }): Promise<Date | undefined>
  readLastGroupActivityAt(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<Date | undefined>
}

function pickChannel(lastGroupAt: Date | undefined, lastDirectAt: Date | undefined) {
  if (lastDirectAt === undefined) return 'group'
  if (lastGroupAt === undefined) return 'direct'
  return lastDirectAt.getTime() > lastGroupAt.getTime() ? 'direct' : 'group'
}

export function createDriverReminderChannelResolver(
  sources: DriverReminderChannelSources,
): DriverReminderChannelResolver {
  return {
    async resolve({ companyId, driverId }): Promise<DriverReminderChannelKind> {
      const { groupJid, phone } = await sources.readContact({ companyId, driverId })
      const [lastGroupAt, lastDirectAt] = await Promise.all([
        groupJid === undefined
          ? undefined
          : sources.readLastGroupActivityAt({ companyId, groupJid }),
        phone === undefined ? undefined : sources.readLastDirectInboundAt({ companyId, phone }),
      ])
      return pickChannel(lastGroupAt, lastDirectAt)
    },
  }
}
