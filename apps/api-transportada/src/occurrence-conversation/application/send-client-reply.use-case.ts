/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T5 (D6, RF7): o operador responde ao cliente pela conversa dele, no WhatsApp do número escolhido em
 * "Responder por". O número vem do `replyTargetId` da faixa, nunca do corpo; o envio sai direto, sem trava de confirmação
 * (`confirmNumber` segue aceito e ignorado, por compatibilidade com o painel antigo). Com o WhatsApp desligado nada é gravado: a tela oferece o e-mail da 279.
 *
 * A ordem é ler e conferir, perguntar ao Evolution se está de pé, gravar `queued` (idempotente pela chave) e só então
 * enviar. Saiu e o fechamento falhou: a mensagem fica `queued` — melhor parada do que o mesmo texto duas vezes.
 */
import type { ApiLogger } from '../../shared/api.types.js'

import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { CLIENT_CHANNEL } from '../../shared/delivery-client-email.constant.js'
import {
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
  WhatsAppEvolutionUnavailableError,
} from '../../whatsapp/domain/whatsapp-evolution.error.js'
import { resolveClientReplyTarget } from '../domain/client-conversation.policy.js'
import { ContractorReplyWhatsAppOffError } from '../domain/contractor-reply-whatsapp.error.js'
import type {
  ClientReplyMessageStatus,
  ClientReplyRepositoryPort,
  ClientReplyWhatsAppSenderPort,
} from './send-client-reply.port.js'

export type SendClientReplyInput = {
  readonly actorUserId: string
  readonly bodyText: string
  readonly companyId: string
  readonly confirmNumber: boolean
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly replyTargetId: string
}

export type SendClientReplyResult = {
  readonly messageId: string
  readonly replayed: boolean
  readonly status: ClientReplyMessageStatus
}

export type SendClientReplyUseCase = {
  send(input: SendClientReplyInput): Promise<SendClientReplyResult>
}

export function createSendClientReplyUseCase(dependencies: {
  readonly logger: Pick<ApiLogger, 'warn'>
  readonly repository: ClientReplyRepositoryPort
  readonly sender: ClientReplyWhatsAppSenderPort
}): SendClientReplyUseCase {
  const { repository, sender } = dependencies

  return {
    async send(input) {
      const { companyId } = input
      const context = await repository.readContext({ companyId, occurrenceId: input.occurrenceId })
      if (context === null) throw new TripOccurrenceNotFoundError()
      const key = {
        companyId,
        conversationId: context.conversationId,
        idempotencyKey: input.idempotencyKey,
      }
      const replay = await repository.findByIdempotencyKey(key)
      if (replay !== null) return { messageId: replay.id, replayed: true, status: replay.status }

      if (
        context.clientChannel !== CLIENT_CHANNEL.WHATSAPP &&
        context.clientChannel !== CLIENT_CHANNEL.BOTH
      ) {
        throw new ContractorReplyWhatsAppOffError()
      }
      if (context.evolutionStatus === null) throw new WhatsAppEvolutionNotConfiguredError()
      if (context.evolutionStatus !== 'active') throw new WhatsAppEvolutionDisabledError()

      const target = resolveClientReplyTarget({
        contacts: context.contacts,
        messages: context.messages,
        replyTargetId: input.replyTargetId,
      })
      if (target === null) throw new TripOccurrenceNotFoundError()

      const connected = await sender.isConnected({ companyId }).catch(() => false)
      if (!connected) throw new WhatsAppEvolutionUnavailableError()

      const inserted = await repository.insertQueued({
        ...key,
        actorUserId: input.actorUserId,
        bodyText: input.bodyText,
        recipientAddress: target.address,
      })
      if (inserted === null) {
        const raced = await repository.findByIdempotencyKey(key)
        if (raced === null) throw new Error('OCCURRENCE_CLIENT_REPLY_NOT_SAVED')
        return { messageId: raced.id, replayed: true, status: raced.status }
      }

      let sent: { readonly providerMessageId: null | string }
      try {
        sent = await sender.sendText({ body: input.bodyText, companyId, number: target.address })
      } catch {
        await repository.markFailed({ companyId, messageId: inserted.id })
        // RF7: só ids; nem número nem texto.
        dependencies.logger.warn('occurrence client reply failed', {
          correlationId: input.correlationId,
          messageId: inserted.id,
        })
        return { messageId: inserted.id, replayed: false, status: 'failed' }
      }
      await repository.markSent({
        companyId,
        messageId: inserted.id,
        providerMessageId: sent.providerMessageId,
      })
      return { messageId: inserted.id, replayed: false, status: 'sent' }
    },
  }
}
