/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF14): o gancho de status do módulo da Meta. A empresa é a do canal que recebeu o
 * webhook (o módulo é um por empresa); o horário é o da Meta, quando vem. Status de mensagem que não
 * é da conversa não acha nada e não muda nada. Falha não sobe para o webhook.
 */
import type { WhatsAppStatus } from '@adatechnology/meta-whatsapp-contracts'

import type { OccurrenceConversationMessageStatus } from '../../database/occurrence-conversation.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'

export const OCCURRENCE_CONVERSATION_WHATSAPP_STATUS_LOG = {
  failed: 'occurrence_conversation_whatsapp_status_failed',
} as const

const STATUS_BY_META: Readonly<Record<string, OccurrenceConversationMessageStatus>> = {
  delivered: 'delivered',
  failed: 'failed',
  read: 'read',
  sent: 'sent',
}

function readMetaTime(timestamp: string | undefined, fallback: Date): Date {
  const seconds = Number(timestamp)
  return timestamp !== undefined && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : fallback
}

export function createOccurrenceConversationWhatsAppStatusHook(deps: {
  readonly apply: (input: {
    readonly at: Date
    readonly companyId: string
    readonly incoming: OccurrenceConversationMessageStatus
    readonly providerMessageId: string
  }) => Promise<void>
  readonly clock: () => Date
  readonly companyId: string
  readonly logger: ApiLogger
}): (status: WhatsAppStatus, session: unknown) => Promise<void> {
  return async function onStatusUpdate(status) {
    const incoming = status.status === undefined ? undefined : STATUS_BY_META[status.status]
    if (status.id === undefined || status.id === '' || incoming === undefined) return
    try {
      await deps.apply({
        at: readMetaTime(status.timestamp, deps.clock()),
        companyId: deps.companyId,
        incoming,
        providerMessageId: status.id,
      })
    } catch (error) {
      deps.logger.error(OCCURRENCE_CONVERSATION_WHATSAPP_STATUS_LOG.failed, {
        companyId: deps.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }
  }
}
