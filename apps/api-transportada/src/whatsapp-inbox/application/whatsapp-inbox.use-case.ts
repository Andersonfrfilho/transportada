/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T5: o que a caixa de conversas do painel faz — listar, ler o histórico, assumir, devolver e marcar lido —,
 * com a trilha de auditoria de assumir e devolver. O estado em si é do `WhatsAppChatTakeoverService` (T2).
 */
import { WhatsAppChatNotFoundError } from '../domain/whatsapp-chat.error.js'
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
  readonly takeOver: (
    input: Actor & { readonly chatId: string },
  ) => Promise<{ readonly chat: WhatsAppChat; readonly renewed: boolean }>
}

export function createWhatsAppInboxUseCase(dependencies: {
  readonly clock: () => Date
  readonly repository: WhatsAppChatRepositoryPort
  readonly takeover: WhatsAppChatTakeoverService
}): WhatsAppInboxUseCase {
  const { clock, repository, takeover } = dependencies

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
