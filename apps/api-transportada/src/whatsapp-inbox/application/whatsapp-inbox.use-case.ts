/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T5: o que a caixa de conversas do painel faz — listar, ler o histórico, assumir, devolver e marcar lido —,
 * com a trilha de auditoria de assumir e devolver. O estado em si é do `WhatsAppChatTakeoverService` (T2).
 */
import {
  WHATSAPP_CHAT_FAILURE_REASONS,
  type WhatsAppChatFailureReason,
} from '../domain/whatsapp-chat.constant.js'
import {
  WhatsAppChatMessageNotFoundError,
  WhatsAppChatMessageNotRetryableError,
  WhatsAppChatNotFoundError,
  WhatsAppChatNotHeldError,
} from '../domain/whatsapp-chat.error.js'
import type { WhatsAppChatTextSender } from './whatsapp-chat-sender.port.js'
import type {
  WhatsAppChat,
  WhatsAppChatListFilter,
  WhatsAppChatMessage,
  WhatsAppChatPage,
  WhatsAppChatRepositoryPort,
} from './whatsapp-chat.port.js'
import type { WhatsAppChatTakeoverService } from './whatsapp-chat-takeover.service.js'

export const WHATSAPP_CHAT_TAKEN_OVER_ACTION = 'whatsapp_chat.taken_over'
export const WHATSAPP_CHAT_RELEASED_ACTION = 'whatsapp_chat.released'

type Actor = { readonly companyId: string; readonly correlationId: string; readonly userId: string }

export type WhatsAppInboxUseCase = {
  readonly list: (input: WhatsAppChatListFilter) => Promise<WhatsAppChatPage<WhatsAppChat>>
  readonly markRead: (input: {
    readonly chatId: string
    readonly companyId: string
  }) => Promise<WhatsAppChat>
  readonly messages: (input: {
    readonly chatId: string
    readonly companyId: string
    readonly cursor?: string | null
    readonly limit: number
  }) => Promise<WhatsAppChatPage<WhatsAppChatMessage>>
  readonly release: (input: Actor & { readonly chatId: string }) => Promise<WhatsAppChat>
  /** RF3: o atendente que segura o chat reenvia uma mensagem que falhou. */
  readonly retry: (
    input: Actor & { readonly chatId: string; readonly messageId: string },
  ) => Promise<WhatsAppChatMessage>
  /** RF3: o atendente que segura o chat fala como o número do bot. O resultado diz se saiu (`sent`) ou falhou. */
  readonly send: (
    input: Actor & { readonly chatId: string; readonly text: string },
  ) => Promise<WhatsAppChatMessage>
  readonly takeOver: (
    input: Actor & { readonly chatId: string },
  ) => Promise<{ readonly chat: WhatsAppChat; readonly renewed: boolean }>
}

const DIRECT_SUFFIX = '@s.whatsapp.net'

/** O Evolution endereça o privado pelos dígitos e o grupo pelo JID inteiro. */
function evolutionNumberOf(chat: WhatsAppChat): string {
  return chat.kind === 'direct' ? chat.chatJid.replace(DIRECT_SUFFIX, '') : chat.chatJid
}

/** O gateway lança com o motivo fechado em `failure`; qualquer outra coisa é `failed`. */
function failureReasonOf(error: unknown): WhatsAppChatFailureReason {
  const failure = (error as { readonly failure?: unknown } | null)?.failure
  return WHATSAPP_CHAT_FAILURE_REASONS.find((reason) => reason === failure) ?? 'failed'
}

export function createWhatsAppInboxUseCase(dependencies: {
  readonly clock: () => Date
  readonly repository: WhatsAppChatRepositoryPort
  /** Ausente (teste, composição sem Evolution): enviar responde como falha `disconnected`, nunca derruba. */
  readonly sender?: WhatsAppChatTextSender
  readonly takeover: WhatsAppChatTakeoverService
}): WhatsAppInboxUseCase {
  const { clock, repository, sender, takeover } = dependencies

  /** Fase 2: chama o Evolution e fecha a linha (`sent` com o id do provedor, ou `failed` com o motivo). */
  const deliver = async (
    chat: WhatsAppChat,
    message: WhatsAppChatMessage,
  ): Promise<WhatsAppChatMessage> => {
    try {
      if (sender === undefined)
        throw Object.assign(new Error('no sender'), { failure: 'disconnected' })
      const sent = await sender.sendText({
        body: message.bodyText,
        companyId: chat.companyId,
        number: evolutionNumberOf(chat),
      })
      const closed = await repository.updateMessageStatus({
        companyId: chat.companyId,
        messageId: message.id,
        providerMessageId: sent.providerMessageId,
        status: 'sent',
      })
      return closed ?? message
    } catch (error) {
      const failed = await repository.updateMessageStatus({
        companyId: chat.companyId,
        failureReason: failureReasonOf(error),
        messageId: message.id,
        status: 'failed',
      })
      return failed ?? message
    }
  }

  const holdOrThrow = async (input: {
    readonly chatId: string
    readonly companyId: string
    readonly userId: string
  }): Promise<WhatsAppChat> => {
    const chat = await repository.findChat({ chatId: input.chatId, companyId: input.companyId })
    if (chat === null) throw new WhatsAppChatNotFoundError()
    // `touch` empurra o prazo (RF6) e devolve `null` quando o atendente não segura mais o chat.
    const held = await takeover.touch(input)
    if (held === null) throw new WhatsAppChatNotHeldError()
    return held
  }

  return {
    list: (input) => repository.listChats(input),

    async markRead({ chatId, companyId }) {
      const chat = await repository.markRead({ chatId, companyId, now: clock() })
      if (chat === null) throw new WhatsAppChatNotFoundError()
      return chat
    },

    async messages(input) {
      const chat = await repository.findChat({ chatId: input.chatId, companyId: input.companyId })
      if (chat === null) throw new WhatsAppChatNotFoundError()
      return repository.listMessages(input)
    },

    async release({ chatId, companyId, correlationId, userId }) {
      const before = await repository.findChat({ chatId, companyId })
      const chat = await takeover.release({ chatId, companyId, userId })
      // Já com o bot: sem efeito e sem trilha (não houve mudança).
      if (before !== null && before.state === 'operator') {
        await repository.recordAudit({
          action: WHATSAPP_CHAT_RELEASED_ACTION,
          actorUserId: userId,
          afterState: 'bot',
          beforeState: 'operator',
          chatId,
          companyId,
          correlationId,
        })
      }
      return chat
    },

    async retry({ chatId, companyId, messageId, userId }) {
      const chat = await holdOrThrow({ chatId, companyId, userId })
      const message = await repository.findMessage({ chatId, companyId, messageId })
      if (message === null) throw new WhatsAppChatMessageNotFoundError()
      if (message.author !== 'operator' || message.status !== 'failed') {
        throw new WhatsAppChatMessageNotRetryableError()
      }
      const requeued = await repository.updateMessageStatus({
        companyId,
        messageId,
        status: 'queued',
      })
      // Duas tentativas ao mesmo tempo: só quem tirou a linha de `failed` envia.
      if (requeued === null) throw new WhatsAppChatMessageNotRetryableError()
      return deliver(chat, requeued)
    },

    async send({ chatId, companyId, text, userId }) {
      const chat = await holdOrThrow({ chatId, companyId, userId })
      const { message } = await repository.appendMessage({
        author: 'operator',
        authorUserId: userId,
        bodyText: text,
        chatId,
        companyId,
        occurredAt: clock(),
      })
      return deliver(chat, message)
    },

    async takeOver({ chatId, companyId, correlationId, userId }) {
      const result = await takeover.takeOver({ chatId, companyId, userId })
      // Renovar o prazo do próprio atendente não é uma assunção nova.
      if (!result.renewed) {
        await repository.recordAudit({
          action: WHATSAPP_CHAT_TAKEN_OVER_ACTION,
          actorUserId: userId,
          afterState: 'operator',
          beforeState: 'bot',
          chatId,
          companyId,
          correlationId,
        })
      }
      return result
    },
  }
}
