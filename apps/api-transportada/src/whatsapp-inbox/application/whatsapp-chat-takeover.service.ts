/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2 (RF1, RF6): assumir, devolver, vencer e perguntar quem atende. As rotas (T5), a guarda dos trilhos (T3),
 * o envio (T6) e o job (T7) chamam por aqui; nenhum deles decide o estado sozinho.
 */
import {
  WhatsAppChatAlreadyTakenOverError,
  WhatsAppChatJidInvalidError,
  WhatsAppChatNotFoundError,
} from '../domain/whatsapp-chat.error.js'
import { classifyWhatsAppChatJid } from '../domain/whatsapp-chat-jid.policy.js'
import {
  computeWhatsAppChatTakeoverExpiry,
  resolveWhatsAppChatAttendance,
  resolveWhatsAppChatTakeoverTimeoutSeconds,
  type WhatsAppChatAttendance,
} from '../domain/whatsapp-chat-takeover.policy.js'
import type {
  WhatsAppChat,
  WhatsAppChatExpired,
  WhatsAppChatKey,
  WhatsAppChatRepositoryPort,
} from './whatsapp-chat.port.js'

export type WhatsAppChatTakeoverService = {
  /** Quem atende o JID agora. Chat que nunca existiu é do bot. É a pergunta da guarda da T3. */
  readonly attendanceOf: (input: {
    readonly chatJid: string
    readonly companyId: string
  }) => Promise<WhatsAppChatAttendance>
  /** O chat do JID, criado com o bot se preciso. JID fora da caixa (`@lid`, broadcast) é 400. */
  readonly ensureChat: (input: {
    readonly chatJid: string
    readonly companyId: string
  }) => Promise<WhatsAppChat>
  /** T7: devolve ao bot os chats vencidos. */
  readonly expireDue: (input: { readonly limit: number }) => Promise<readonly WhatsAppChatExpired[]>
  /** Devolver ao bot (RF1). Já com o bot é sem efeito, não erro. */
  readonly release: (input: WhatsAppChatKey & { readonly userId: string }) => Promise<WhatsAppChat>
  /** Assumir (RF1). Outro atendente segurando → 409 com quem segura; o próprio atendente renova o prazo. */
  readonly takeOver: (input: WhatsAppChatKey & { readonly userId: string }) => Promise<{
    readonly chat: WhatsAppChat
    readonly renewed: boolean
  }>
  /** RF6: a mensagem do atendente empurra o prazo; `null` quando ele não segura mais (o bot voltou). */
  readonly touch: (
    input: WhatsAppChatKey & { readonly userId: string },
  ) => Promise<WhatsAppChat | null>
}

export function createWhatsAppChatTakeoverService(dependencies: {
  readonly clock: () => Date
  readonly repository: WhatsAppChatRepositoryPort
}): WhatsAppChatTakeoverService {
  const { clock, repository } = dependencies

  const expiryFor = async (companyId: string, now: Date): Promise<Date> => {
    const configured = await repository.findTakeoverTimeoutSeconds({ companyId })
    return computeWhatsAppChatTakeoverExpiry(
      now,
      resolveWhatsAppChatTakeoverTimeoutSeconds(configured),
    )
  }

  return {
    async attendanceOf(input) {
      const chat = await repository.findChatByJid(input)
      return chat === null ? { kind: 'bot' } : resolveWhatsAppChatAttendance(chat, clock())
    },

    async ensureChat(input) {
      const kind = classifyWhatsAppChatJid(input.chatJid)
      if (kind === null) throw new WhatsAppChatJidInvalidError()
      return repository.ensureChat({ ...input, kind })
    },

    async expireDue(input) {
      return repository.expireDue({ limit: input.limit, now: clock() })
    },

    async release(input) {
      const result = await repository.release({ ...input, now: clock() })
      if (result.outcome === 'not_found') throw new WhatsAppChatNotFoundError()
      return result.chat
    },

    async takeOver(input) {
      const now = clock()
      const expiresAt = await expiryFor(input.companyId, now)
      const result = await repository.takeOver({ ...input, expiresAt, now })
      if (result.outcome === 'not_found') throw new WhatsAppChatNotFoundError()
      if (result.outcome === 'held') {
        throw new WhatsAppChatAlreadyTakenOverError({
          expiresAt: result.expiresAt,
          userId: result.holderUserId,
        })
      }
      return { chat: result.chat, renewed: result.outcome === 'renewed' }
    },

    async touch(input) {
      const now = clock()
      const expiresAt = await expiryFor(input.companyId, now)
      return repository.extendTakeover({ ...input, expiresAt, now })
    },
  }
}
