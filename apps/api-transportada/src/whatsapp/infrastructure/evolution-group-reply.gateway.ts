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

/**
 * Spec 292 T4: a resposta do bot no grupo, pelo `sendText` do Evolution da empresa com o `@g.us` como
 * destino (o SDK 0.3.0 não normaliza grupo). Sai fora do webhook: o ritmo do número (spec 289) pode
 * segurar o envio por segundos, e o Evolution não pode esperar a resposta HTTP por isso. Falha vai a log
 * sem número, grupo nem texto.
 *
 * Uma resposta é UMA mensagem (os textos unidos por linha em branco), e com `turnReplies` tudo o que o bot diz
 * no mesmo turno também: o ritmo do número segura cada mensagem seguinte, e a pergunta mandada separada chegava
 * depois de o motorista já ter respondido.
 */
export function createEvolutionGroupReplySender(dependencies: {
  readonly logger: ApiLogger
  readonly sendText: (input: {
    readonly body: string
    readonly companyId: string
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
  }) {
    const { body, companyId, groupJid } = input
    const run = async () => {
      try {
        await dependencies.sendText({ body, companyId, number: groupJid })
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

  return {
    /** Para testes e desligamento: espera as respostas já enfileiradas. */
    idle: async () => {
      await Promise.all(queues.values())
    },
    send({ companyId, groupJid, texts }) {
      if (texts.length === 0) return
      const body = texts.join(WHATSAPP_TURN_SEPARATOR)
      if (dependencies.turnReplies === undefined) {
        for (const chunk of chunkWhatsAppTexts([body]))
          enqueue({ body: chunk, companyId, groupJid })
        return
      }
      void dependencies.turnReplies.send({
        body,
        deliver: async (joined) => enqueue({ body: joined, companyId, groupJid }),
        key: `${companyId}|${groupJid}`,
      })
    },
  }
}
