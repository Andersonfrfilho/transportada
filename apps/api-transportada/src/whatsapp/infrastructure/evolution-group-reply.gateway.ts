/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import {
  chunkWhatsAppTexts,
  WHATSAPP_TURN_SEPARATOR,
  type WhatsAppTurnReplies,
} from '../../whatsapp-commands/application/whatsapp-turn-replies.service.js'
import type { GroupReplySenderPort } from '../application/whatsapp-group-request.port.js'

const PHONE_DIGITS = /^\d{8,15}$/u

/**
 * Spec 292 T4: a resposta do bot no grupo, pelo `sendText` do Evolution da empresa com o `@g.us` como
 * destino (o SDK 0.3.0 não normaliza grupo). Sai fora do webhook: o ritmo do número (spec 289) pode
 * segurar o envio por segundos, e o Evolution não pode esperar a resposta HTTP por isso. Falha vai a log
 * sem número, grupo nem texto.
 *
 * Uma resposta é UMA mensagem (os textos unidos por linha em branco), e com `turnReplies` tudo o que o bot diz
 * no mesmo turno também: o ritmo do número segura cada mensagem seguinte, e a pergunta mandada separada chegava
 * depois de o motorista já ter respondido.
 *
 * Com `mentionNumber`, a primeira mensagem abre com a marca (`@número`, que o WhatsApp mostra como o nome do contato)
 * e o número vai em `mentioned`: quem pediu é avisado mesmo com o grupo silenciado. Sem número de telefone válido, sai sem
 * marca, nunca falha. O aviso sem pedido (vencimento do pedido) não marca ninguém.
 */
export function createEvolutionGroupReplySender(dependencies: {
  readonly logger: ApiLogger
  readonly sendText: (input: {
    readonly body: string
    readonly companyId: string
    /** Só dígitos: o Evolution marca esse número, e o corpo já traz o `@número`. */
    readonly mentionNumber?: string
    readonly number: string
  }) => Promise<unknown>
  /** O turno da mensagem recebida; ausente, cada chamada é uma mensagem. */
  readonly turnReplies?: WhatsAppTurnReplies
}): GroupReplySenderPort & { readonly idle: () => Promise<void> } {
  /** Uma fila por empresa: o ritmo de um número não segura a resposta de outro. */
  const queues = new Map<string, Promise<void>>()

  function enqueue(input: {
    readonly body: string
    readonly companyId: string
    readonly groupJid: string
    readonly mentionNumber?: string
  }) {
    const { body, companyId, groupJid, mentionNumber } = input
    const run = async () => {
      try {
        await dependencies.sendText({
          body,
          companyId,
          number: groupJid,
          ...(mentionNumber === undefined ? {} : { mentionNumber }),
        })
      } catch (error) {
        dependencies.logger.warn('whatsapp_group_request.reply_failed', {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    }
    const next = (queues.get(companyId) ?? Promise.resolve()).then(run)
    queues.set(companyId, next)
    void next.finally(() => {
      if (queues.get(companyId) === next) queues.delete(companyId)
    })
  }

  /** A marca vai uma vez, na primeira mensagem entregue: texto cortado pelo teto não marca de novo. */
  function createMentionOnFirstMessage(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly mentionNumber: string | undefined
  }): (body: string) => void {
    const { companyId, groupJid } = input
    let pendingMention =
      input.mentionNumber !== undefined && PHONE_DIGITS.test(input.mentionNumber)
        ? input.mentionNumber
        : undefined
    return (body) => {
      if (pendingMention === undefined) return enqueue({ body, companyId, groupJid })
      const mentionNumber = pendingMention
      pendingMention = undefined
      enqueue({ body: `@${mentionNumber} ${body}`, companyId, groupJid, mentionNumber })
    }
  }

  return {
    /** Para testes e desligamento: espera as respostas já enfileiradas. */
    idle: async () => {
      await Promise.all(queues.values())
    },
    send({ companyId, groupJid, mentionNumber, texts }) {
      if (texts.length === 0) return
      const body = texts.join(WHATSAPP_TURN_SEPARATOR)
      const deliver = createMentionOnFirstMessage({ companyId, groupJid, mentionNumber })
      if (dependencies.turnReplies === undefined) {
        for (const chunk of chunkWhatsAppTexts([body])) deliver(chunk)
        return
      }
      void dependencies.turnReplies.send({
        body,
        deliver: async (joined) => deliver(joined),
        key: `${companyId}|${groupJid}`,
      })
    },
  }
}
