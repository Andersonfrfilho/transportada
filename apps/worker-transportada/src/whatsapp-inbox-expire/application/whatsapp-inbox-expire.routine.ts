/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE,
  WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES,
} from '../domain/whatsapp-inbox-expire.constant.js'
import type { ExpireDueWhatsAppChats } from './whatsapp-inbox-expire.port.js'

export type WhatsAppInboxExpireRoutineDependencies = {
  readonly expire: ExpireDueWhatsAppChats
  readonly logger: WorkerLogger
  readonly now: () => Date
}

/**
 * Spec 319 T7 (RF6): a conversa que o atendente deixou vencer volta ao bot. A guarda da API já trata o prazo vencido
 * como bot na leitura; o ciclo grava a devolução para a caixa e a auditoria. Mesmo desenho das outras limpezas —
 * lotes, teto e parada no limite do lote — e vocabulário de falha vazio: a rotina só toca o próprio banco.
 */
export function createWhatsAppInboxExpireRoutine(
  dependencies: WhatsAppInboxExpireRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: WhatsAppInboxExpireRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  let released = 0
  let batches = 0

  while (batches < WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES && !context.isStopRequested()) {
    const returned = await dependencies.expire({
      limit: WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE,
      now: dependencies.now(),
    })
    if (returned === 0) break
    released += returned
    batches += 1
    if (returned < WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE) break
  }

  // Só contagens e os ids da execução: JID e telefone nunca vão para o log.
  safeLogInfo({
    logger: dependencies.logger,
    message: 'whatsapp_inbox_chat_expire_cycle_finished',
    metadata: {
      batches,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: batches >= WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES,
      released,
    },
  })

  return { counters: { batches, released }, outcome: 'succeeded' }
}
