/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF9, D6): o hook da conversa, na frente do despachante de comandos da spec 144. A
 * mensagem de contato com aceite vai para a conversa (ou para "não atribuída") e **para ali**; tudo o
 * mais — número sem aceite, número desconhecido, motorista fora de resposta — segue para o
 * despachante, que continua recusando quem não é vinculado, exatamente como hoje.
 *
 * ⚠️ Como no despachante: falha aqui não sobe para o webhook (a Meta desativaria o endereço), e o log
 * leva só o nome do erro — nunca telefone, corpo ou nome de arquivo.
 */
import type {
  ConversationSession,
  MessageHookOutcome,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { WHATSAPP_COMMAND_RATE_LIMIT } from '../../whatsapp-commands/domain/whatsapp-command.constant.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import { resolveWhatsAppAttribution } from '../domain/whatsapp-attribution.policy.js'
import type { WhatsAppConversationInboundPort } from './whatsapp-conversation-inbound.port.js'

const HANDLED: MessageHookOutcome = { outcome: 'handled' }

export const OCCURRENCE_CONVERSATION_WHATSAPP_LOG = {
  failed: 'occurrence_conversation_whatsapp_failed',
} as const

type Handler = (
  message: WhatsAppMessage,
  session: ConversationSession,
) => Promise<MessageHookOutcome>

/**
 * O texto que a conversa guarda: o corpo, o título do botão ou da lista, ou a legenda da mídia. A
 * mídia em si (baixar da Meta, bucket, `sha256`) é dos anexos da T702.
 */
export function extractWhatsAppConversationText(message: WhatsAppMessage): string {
  const record = message as unknown as Record<string, unknown>
  const candidates: unknown[] = [
    message.text?.body,
    message.interactive?.button_reply?.title,
    message.interactive?.list_reply?.title,
    ...['image', 'document', 'video'].map((kind) => {
      const media = record[kind]
      return typeof media === 'object' && media !== null
        ? (media as Record<string, unknown>).caption
        : undefined
    }),
  ]
  const text = candidates.find((value): value is string => typeof value === 'string') ?? ''
  return text.slice(0, OCCURRENCE_MAIL_LIMITS.body)
}

function readContextId(message: WhatsAppMessage): null | string {
  const id = message.context?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function createOccurrenceConversationWhatsAppHook(deps: {
  readonly clock: () => Date
  readonly inbound: WhatsAppConversationInboundPort
  readonly logger: ApiLogger
  readonly next: Handler
  /** O mesmo limitador do despachante, noutro balde: a conversa não gasta o teto do comando. */
  readonly rateLimiter: RateLimiter
}): Handler {
  return async function onMessageReceived(message, session) {
    const phone = message.from ?? session.whatsappNumber
    const providerMessageId = message.id
    /** Sem o id da Meta não há como gravar uma vez só: segue o caminho de sempre. */
    if (providerMessageId === undefined || providerMessageId === '') {
      return deps.next(message, session)
    }
    const limit = deps.rateLimiter.consume({
      key: `occurrence-conversation:${session.companyId}:${toWhatsAppPhoneKey(phone)}`,
      policy: WHATSAPP_COMMAND_RATE_LIMIT,
    })
    if (!limit.allowed) return HANDLED

    try {
      const context = await deps.inbound.loadAttributionContext({
        companyId: session.companyId,
        phone,
        replyToProviderMessageId: readContextId(message),
      })
      const attribution = resolveWhatsAppAttribution(context)
      const common = {
        bodyText: extractWhatsAppConversationText(message),
        companyId: session.companyId,
        providerMessageId,
        receivedAt: deps.clock(),
      }

      if (attribution.kind === 'conversation') {
        const driverUserId =
          context.replyTo?.participant === 'driver' && attribution.via === 'reply'
            ? context.sender.driverUserId
            : null
        await deps.inbound.recordConversationMessage({
          ...common,
          conversationId: attribution.conversationId,
          driverUserId,
          senderAddress: driverUserId === null ? phone : null,
        })
        return HANDLED
      }
      if (attribution.kind === 'unassigned') {
        const optedIn = context.sender.contractorContacts.filter((contact) => contact.optedIn)
        await deps.inbound.recordUnassigned({
          ...common,
          contractorContactId: optedIn.length === 1 ? (optedIn[0]?.contactId ?? null) : null,
          senderAddress: phone,
        })
        return HANDLED
      }
    } catch (error) {
      deps.logger.error(OCCURRENCE_CONVERSATION_WHATSAPP_LOG.failed, {
        companyId: session.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return HANDLED
    }
    return deps.next(message, session)
  }
}
