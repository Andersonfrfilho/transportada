/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T3 (RF2): a guarda dos dois trilhos de entrada do bot (o privado da 308 e o grupo). Com o chat assumido
 * por um atendente, a mensagem recebida não responde nem avança fluxo: só é gravada no histórico do chat. Sem
 * assumir (ou com o prazo vencido), tudo segue como antes.
 *
 * Falhas:
 * - não deu para perguntar quem atende: segue com o bot (o comportamento de antes da 319) e loga;
 * - o chat está assumido e a gravação falhou: o bot continua calado (quem assumiu está lá) e loga.
 *
 * ⚠️ Nada de número, texto ou nome em log: só empresa, id do provedor e o desfecho.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { WhatsAppChatContentKind } from '../domain/whatsapp-chat.constant.js'
import type { WhatsAppChatRepositoryPort } from './whatsapp-chat.port.js'
import type { WhatsAppChatTakeoverService } from './whatsapp-chat-takeover.service.js'

export const WHATSAPP_CHAT_TAKEOVER_GUARD_LOG = {
  held: 'whatsapp_inbox.guard.held',
  observeFailed: 'whatsapp_inbox.history.observe_failed',
  recordBotFailed: 'whatsapp_inbox.history.record_bot_failed',
  recordFailed: 'whatsapp_inbox.guard.record_failed',
  unavailable: 'whatsapp_inbox.guard.unavailable',
} as const

const PHONE_DIGITS = /^[0-9]{8,15}$/u

/** A mensagem recebida, do jeito que vai ao histórico. Só é montada quando o chat está assumido. */
export type WhatsAppChatHeldMessage = {
  /** `driver` no privado e o dono do grupo; `member` qualquer outra pessoa do grupo. */
  readonly author: 'driver' | 'member'
  readonly bodyText: string
  readonly contentKind: WhatsAppChatContentKind
  readonly occurredAt?: Date | undefined
  readonly providerMessageId: string
  /** Só dígitos; fora de 8 a 15 dígitos vai como `null`. */
  readonly senderPhone: null | string
}

export type WhatsAppChatTakeoverGuard = {
  /**
   * `true`: o chat está com um atendente; a mensagem foi gravada (ou tentada) e o trilho não segue. `false`: o bot
   * atende, como antes. `message` só é chamada no `true`, para o grupo não perguntar ao Evolution quem escreveu
   * quando o bot é quem atende.
   */
  readonly holdIfTakenOver: (input: {
    readonly chatJid: string
    readonly companyId: string
    readonly message: () => Promise<WhatsAppChatHeldMessage> | WhatsAppChatHeldMessage
  }) => Promise<boolean>
  /**
   * T4 (RF4): a recebida que o bot atende também entra no histórico, para a caixa mostrar a conversa inteira quando o
   * atendente assumir. Nunca lança nem atrasa o trilho: quem chama não espera por ela.
   */
  readonly observeInbound: (input: {
    readonly chatJid: string
    readonly companyId: string
    readonly message: () => Promise<WhatsAppChatHeldMessage> | WhatsAppChatHeldMessage
  }) => Promise<void>
  /** T4 (RF4): o que o bot disse num chat da caixa (grupo cadastrado ou motorista), com o id do provedor para deduplicar o eco. */
  readonly recordBotMessage: (input: {
    readonly bodyText: string
    readonly chatJid: string
    readonly companyId: string
    readonly providerMessageId: null | string
  }) => Promise<void>
}

export function createWhatsAppChatTakeoverGuard(dependencies: {
  readonly logger: ApiLogger
  readonly repository: Pick<WhatsAppChatRepositoryPort, 'appendMessage'>
  readonly service: Pick<WhatsAppChatTakeoverService, 'attendanceOf' | 'ensureChat'>
}): WhatsAppChatTakeoverGuard {
  const { logger, repository, service } = dependencies
  return {
    async holdIfTakenOver({ chatJid, companyId, message }) {
      let attendance: Awaited<ReturnType<WhatsAppChatTakeoverService['attendanceOf']>>
      try {
        attendance = await service.attendanceOf({ chatJid, companyId })
      } catch (error) {
        logger.warn(WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.unavailable, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return false
      }
      if (attendance.kind !== 'operator') return false

      let providerMessageId: null | string = null
      try {
        const held = await message()
        providerMessageId = held.providerMessageId
        const chat = await service.ensureChat({ chatJid, companyId })
        const { outcome } = await repository.appendMessage({
          author: held.author,
          bodyText: held.bodyText,
          chatId: chat.id,
          companyId,
          contentKind: held.contentKind,
          ...(held.occurredAt === undefined ? {} : { occurredAt: held.occurredAt }),
          providerMessageId: held.providerMessageId,
          senderPhone:
            held.senderPhone !== null && PHONE_DIGITS.test(held.senderPhone)
              ? held.senderPhone
              : null,
        })
        logger.info(WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.held, {
          companyId,
          outcome,
          providerMessageId,
        })
      } catch (error) {
        logger.warn(WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.recordFailed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
          providerMessageId,
        })
      }
      return true
    },

    async observeInbound({ chatJid, companyId, message }) {
      try {
        const held = await message()
        const chat = await service.ensureChat({ chatJid, companyId })
        await repository.appendMessage({
          author: held.author,
          bodyText: held.bodyText,
          chatId: chat.id,
          companyId,
          contentKind: held.contentKind,
          ...(held.occurredAt === undefined ? {} : { occurredAt: held.occurredAt }),
          providerMessageId: held.providerMessageId,
          senderPhone:
            held.senderPhone !== null && PHONE_DIGITS.test(held.senderPhone)
              ? held.senderPhone
              : null,
        })
      } catch (error) {
        logger.warn(WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.observeFailed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    },

    async recordBotMessage({ bodyText, chatJid, companyId, providerMessageId }) {
      try {
        const chat = await service.ensureChat({ chatJid, companyId })
        await repository.appendMessage({
          author: 'bot',
          bodyText,
          chatId: chat.id,
          companyId,
          providerMessageId,
        })
      } catch (error) {
        logger.warn(WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.recordBotFailed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    },
  }
}
