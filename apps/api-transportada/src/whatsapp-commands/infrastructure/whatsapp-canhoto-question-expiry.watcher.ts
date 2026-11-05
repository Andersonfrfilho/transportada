/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 S5/C4: a pergunta do canhoto vence em 30 minutos e a foto dela sai do bucket mesmo que o motorista nunca mais
 * escreva — antes, só quem lia a pergunta a vencia. No molde do vigia do pedido do grupo: um `update … returning`
 * reivindica cada pergunta (uma réplica só apaga cada foto), em lotes, a cada `intervalMs`.
 *
 * ⚠️ Só contagem em log: nem chave do objeto, nem motorista.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import { CANHOTO_QUESTION_TTL_MILLISECONDS } from '../application/whatsapp-canhoto-recognition.service.js'

const DEFAULT_INTERVAL_MILLISECONDS = 60_000
const BATCH_LIMIT = 100

export type CanhotoQuestionExpiryPorts = {
  readonly media: {
    remove(input: { readonly companyId: string; readonly objectKey: string }): Promise<void>
  }
  readonly questions: {
    /** Cancela as perguntas abertas antes de `before` e devolve a foto de cada uma. */
    expireOpen(input: {
      readonly before: Date
      readonly limit: number
    }): Promise<readonly { readonly companyId: string; readonly objectKey: string }[]>
  }
}

export function startCanhotoQuestionExpiryWatcher(
  dependencies: CanhotoQuestionExpiryPorts & {
    readonly intervalMs?: number
    readonly logger: Pick<ApiLogger, 'info' | 'warn'>
    readonly now?: () => Date
  },
): { readonly stop: () => void; readonly tick: () => Promise<void> } {
  const { logger, media, questions } = dependencies
  const clock = dependencies.now ?? (() => new Date())

  async function tick(): Promise<void> {
    try {
      const expired = await questions.expireOpen({
        before: new Date(clock().getTime() - CANHOTO_QUESTION_TTL_MILLISECONDS),
        limit: BATCH_LIMIT,
      })
      if (expired.length === 0) return
      const removals = await Promise.allSettled(expired.map((row) => media.remove(row)))
      logger.info('whatsapp_canhoto_question.expired', {
        expired: expired.length,
        removeFailed: removals.filter((removal) => removal.status === 'rejected').length,
      })
    } catch (error) {
      logger.warn('whatsapp_canhoto_question.expiry_failed', {
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }
  }

  const timer = setInterval(
    () => void tick(),
    dependencies.intervalMs ?? DEFAULT_INTERVAL_MILLISECONDS,
  )
  timer.unref()
  return { stop: () => clearInterval(timer), tick }
}
