/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { withGroupMention } from '../../whatsapp/application/whatsapp-group-mention.service.js'
import type { GroupStopReminderSenderPort } from '../application/group-stop-reminder-sender.port.js'

/**
 * Spec 299 T2.1: o lembrete no grupo sai pelo `sendText` do Evolution da empresa (o mesmo do boleto) e marca o motorista
 * ATUAL da viagem, lido na hora do envio: a troca de tripulação não reatribui o lembrete, então `driver_id` pode estar velho.
 */
export function createGroupStopReminderSender(dependencies: {
  readonly readCurrentDriverNumber: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<string | undefined>
  readonly sendText: (input: {
    readonly body: string
    readonly companyId: string
    readonly mentionNumber?: string
    readonly number: string
  }) => Promise<{ readonly providerMessageId: null | string }>
}): GroupStopReminderSenderPort {
  return {
    async send({ body, companyId, groupJid, tripId }) {
      const mentionNumber = await dependencies.readCurrentDriverNumber({ companyId, tripId })
      const mention = withGroupMention({ body, mentionNumber })
      return dependencies.sendText({ companyId, number: groupJid, ...mention })
    },
  }
}
