/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T802: o gancho que os registros de ocorrência chamam **depois do commit** — o mesmo
 * lugar do aviso interno (`notifyOccurrence`). Dispara e esquece: o registro já está gravado e nunca
 * cai por causa do aviso. O log só leva ids e códigos; endereço, assunto, corpo e a mensagem do erro
 * ficam de fora (regra da spec).
 */
import type { AutomaticOccurrenceMailResult } from './send-automatic-occurrence-mail.use-case.js'

type HookLogger = {
  error(event: string, fields?: Record<string, unknown>): void
  info(event: string, fields?: Record<string, unknown>): void
}

export type AutomaticOccurrenceMailHook = {
  announce(input: {
    readonly companyId: string
    readonly correlationId?: string
    readonly occurrenceIds: readonly string[]
  }): void
  /** Só para teste: espera os avisos em voo. */
  settled(): Promise<void>
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'UNEXPECTED'
  }
  return 'UNEXPECTED'
}

export function createAutomaticOccurrenceMailHook(dependencies: {
  readonly logger: HookLogger
  readonly useCase: {
    send(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly occurrenceId: string
    }): Promise<AutomaticOccurrenceMailResult>
  }
}): AutomaticOccurrenceMailHook {
  /**
   * Spec 183 T903 (C4/S4): uma fila só, em série. O lote do escritório tem até 50 notas, e cada
   * aviso abre a própria transação: em paralelo, o lote tomava o pool inteiro (10 conexões) depois
   * da resposta, e as requisições dos outros esperavam até 503.
   */
  let queue: Promise<void> = Promise.resolve()

  function sendOne(companyId: string, correlationId: string, occurrenceId: string): Promise<void> {
    return dependencies.useCase
      .send({ companyId, correlationId, occurrenceId })
      .then((result) => {
        if (result.outcome === 'sent') {
          dependencies.logger.info('occurrence_automatic_mail_sent', {
            companyId,
            occurrenceId,
            recipientCount: result.recipientCount,
            whatsappFallbackCount: result.whatsappFallbackCount,
            whatsappUnreachableCount: result.whatsappUnreachableCount,
          })
          return
        }
        dependencies.logger.info('occurrence_automatic_mail_skipped', {
          companyId,
          occurrenceId,
          reason: result.reason,
        })
      })
      .catch((error: unknown) => {
        dependencies.logger.error('occurrence_automatic_mail_failed', {
          companyId,
          errorCode: errorCode(error),
          occurrenceId,
        })
      })
  }

  return {
    announce({ companyId, correlationId, occurrenceIds }) {
      for (const occurrenceId of occurrenceIds) {
        queue = queue.then(() =>
          sendOne(companyId, correlationId ?? crypto.randomUUID(), occurrenceId),
        )
      }
    },
    async settled() {
      await queue
    },
  }
}
