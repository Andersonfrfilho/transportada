/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { GroupReplySenderPort } from '../application/whatsapp-group-request.port.js'

/**
 * Spec 292 T4: a resposta do bot no grupo, pelo `sendText` do Evolution da empresa com o `@g.us` como
 * destino (o SDK 0.3.0 não normaliza grupo). Sai fora do webhook: o ritmo do número (spec 289) pode
 * segurar o envio por segundos, e o Evolution não pode esperar a resposta HTTP por isso. As mensagens
 * de uma mesma chamada saem em ordem; falha vai a log sem número, grupo nem texto.
 */
export function createEvolutionGroupReplySender(dependencies: {
  readonly logger: ApiLogger
  readonly sendText: (input: {
    readonly body: string
    readonly companyId: string
    readonly number: string
  }) => Promise<unknown>
}): GroupReplySenderPort & { readonly idle: () => Promise<void> } {
  /** Uma fila por empresa: o ritmo de um número não segura a resposta de outro. */
  const queues = new Map<string, Promise<void>>()

  return {
    /** Para testes e desligamento: espera as respostas já enfileiradas. */
    idle: async () => {
      await Promise.all(queues.values())
    },
    send({ companyId, groupJid, texts }) {
      const run = async () => {
        for (const body of texts) {
          try {
            await dependencies.sendText({ body, companyId, number: groupJid })
          } catch (error) {
            dependencies.logger.warn('whatsapp_group_request.reply_failed', {
              companyId,
              errorName: error instanceof Error ? error.name : typeof error,
            })
            return
          }
        }
      }
      const next = (queues.get(companyId) ?? Promise.resolve()).then(run)
      queues.set(companyId, next)
      void next.finally(() => {
        if (queues.get(companyId) === next) queues.delete(companyId)
      })
    },
  }
}
