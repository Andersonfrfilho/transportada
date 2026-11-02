/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4, D6): o que chega pelo número do Evolution entra na conversa da ocorrência — ou
 * em "não atribuídas" — e o estado de entrega do que saiu por ele avança no selo da mensagem.
 *
 * É o mesmo trilho da Meta (spec 183): as leituras e escritas são as de
 * `WhatsAppConversationInboundPort`, idempotentes pelo id do provedor (o `unique` de
 * `provider_message_id` no canal `whatsapp`), e o status vai pelo `applyProviderMessageStatus`, que
 * só avança. O que muda é a política (`evolution-attribution.policy.ts`): sem fluxo de comando nem
 * recusa, e com a resposta de quem recebeu o boleto.
 *
 * ⚠️ Falha aqui não sobe para o webhook, e o log leva só o nome do erro — nunca número nem texto.
 */
import type { OccurrenceConversationMessageStatus } from '../../database/occurrence-conversation.schema.js'
import type { RateLimiter } from '../../http/rate-limiter.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { WHATSAPP_COMMAND_RATE_LIMIT } from '../../whatsapp-commands/domain/whatsapp-command.constant.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import { resolveEvolutionAttribution } from '../domain/evolution-attribution.policy.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import type { WhatsAppConversationInboundPort } from './whatsapp-conversation-inbound.port.js'

export const OCCURRENCE_CONVERSATION_EVOLUTION_LOG = {
  failed: 'occurrence_conversation_evolution_failed',
  statusFailed: 'occurrence_conversation_evolution_status_failed',
} as const

/** Telefone de verdade tem de 10 a 15 dígitos (E.164 sem o `+`); o resto não casa com cadastro nenhum. */
const PHONE_DIGITS_PATTERN = /^[1-9]\d{9,14}$/u

export type EvolutionConversationInboundPort = WhatsAppConversationInboundPort & {
  /**
   * A conversa do cliente para a qual o painel mais recentemente mandou algo por WhatsApp a este número (chave do
   * número, `toWhatsAppPhoneKey`), ou `null`. É onde cai o "obrigado" de quem recebeu o boleto e não citou a mensagem.
   */
  findLatestClientConversation(input: {
    readonly companyId: string
    readonly phoneKey: string
  }): Promise<null | string>
  /**
   * O número (E.164) da entrega que a mensagem citada conta (`system_notice.deliveryId`, gravado pela
   * T5), ou `null` quando a citada não é um envio com entrega. Spec 283: com a conversa do cliente
   * daquela entrega, quando ela existe.
   */
  findReplyRecipient(input: {
    readonly companyId: string
    readonly replyToProviderMessageId: string
  }): Promise<null | {
    readonly address: string
    readonly clientConversationId: null | string
  }>
}

export type EvolutionInboundMessage = {
  /** Número de quem escreveu, só dígitos (o leitor do SDK já descartou grupo, status e `@lid`). */
  readonly from: string
  readonly providerMessageId: string
  readonly replyToProviderMessageId: null | string
  readonly text: null | string
}

export type EvolutionInboundOutcome =
  | 'conversation'
  | 'failed'
  | 'ignored'
  | 'rate_limited'
  | 'unassigned'

export type EvolutionConversationInbound = {
  receiveMessage(input: {
    readonly companyId: string
    readonly message: EvolutionInboundMessage
  }): Promise<EvolutionInboundOutcome>
  receiveStatus(input: {
    readonly companyId: string
    readonly providerMessageId: string
    readonly status: OccurrenceConversationMessageStatus
  }): Promise<void>
}

export function createEvolutionConversationInbound(deps: {
  readonly applyStatus: (input: {
    readonly at: Date
    readonly companyId: string
    readonly incoming: OccurrenceConversationMessageStatus
    readonly providerMessageId: string
  }) => Promise<void>
  readonly clock: () => Date
  readonly inbound: EvolutionConversationInboundPort
  readonly logger: ApiLogger
  /** Outro balde que o da Meta: um número insistente no Evolution não gasta o teto do comando. */
  readonly rateLimiter: RateLimiter
}): EvolutionConversationInbound {
  return {
    async receiveMessage({ companyId, message }) {
      if (message.providerMessageId === '' || !PHONE_DIGITS_PATTERN.test(message.from)) {
        return 'ignored'
      }
      const senderPhoneKey = toWhatsAppPhoneKey(message.from)
      const limit = deps.rateLimiter.consume({
        key: `occurrence-conversation-evolution:${companyId}:${senderPhoneKey}`,
        policy: WHATSAPP_COMMAND_RATE_LIMIT,
      })
      if (!limit.allowed) return 'rate_limited'

      try {
        const replyTo = message.replyToProviderMessageId
        const [context, recipient] = await Promise.all([
          deps.inbound.loadAttributionContext({
            companyId,
            phone: message.from,
            replyToProviderMessageId: replyTo,
          }),
          replyTo === null
            ? Promise.resolve(null)
            : deps.inbound.findReplyRecipient({ companyId, replyToProviderMessageId: replyTo }),
        ])
        const attribution = resolveEvolutionAttribution({
          ...context,
          replyToClientConversationId: recipient?.clientConversationId ?? null,
          replyToRecipientPhoneKey:
            recipient === null ? null : toWhatsAppPhoneKey(recipient.address.replace(/\D/gu, '')),
          senderPhoneKey,
        })
        const common = {
          bodyText: (message.text ?? '').slice(0, OCCURRENCE_MAIL_LIMITS.body),
          companyId,
          providerMessageId: message.providerMessageId,
          receivedAt: deps.clock(),
        }

        if (attribution.kind === 'conversation') {
          await deps.inbound.recordConversationMessage({
            ...common,
            conversationId: attribution.conversationId,
            driverUserId: attribution.driverUserId,
            senderAddress: attribution.driverUserId === null ? message.from : null,
          })
          return 'conversation'
        }

        /**
         * Quem recebeu o boleto costuma responder sem citar ("obrigado"): sem atribuição por contato ou citação, a
         * mensagem entra na conversa do cliente a que o painel escreveu por último para esse número.
         */
        const clientConversationId = await deps.inbound.findLatestClientConversation({
          companyId,
          phoneKey: senderPhoneKey,
        })
        if (clientConversationId !== null) {
          await deps.inbound.recordConversationMessage({
            ...common,
            conversationId: clientConversationId,
            driverUserId: null,
            senderAddress: message.from,
          })
          return 'conversation'
        }

        const optedIn = context.sender.contractorContacts.filter((contact) => contact.optedIn)
        await deps.inbound.recordUnassigned({
          ...common,
          contractorContactId: optedIn.length === 1 ? (optedIn[0]?.contactId ?? null) : null,
          senderAddress: message.from,
        })
        return 'unassigned'
      } catch (error) {
        deps.logger.error(OCCURRENCE_CONVERSATION_EVOLUTION_LOG.failed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return 'failed'
      }
    },

    async receiveStatus({ companyId, providerMessageId, status }) {
      if (providerMessageId === '') return
      try {
        await deps.applyStatus({ at: deps.clock(), companyId, incoming: status, providerMessageId })
      } catch (error) {
        deps.logger.error(OCCURRENCE_CONVERSATION_EVOLUTION_LOG.statusFailed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    },
  }
}
