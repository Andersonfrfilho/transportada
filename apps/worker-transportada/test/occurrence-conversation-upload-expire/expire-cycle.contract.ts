/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c2: a rotina que expira o pedido de upload do anexo da conversa. A unidade (apagar o
 * objeto antes de marcar `expired`, transação por unidade) é a mesma da rotina irmã da spec 179,
 * provada em `trip-occurrence-upload-expire/expire-unit.contract.ts`; aqui, o ciclo e o nome.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createOccurrenceConversationUploadExpireRoutine } from '../../src/occurrence-conversation-upload-expire/application/occurrence-conversation-upload-expire.routine.js'
import {
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_JOB,
  OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../../src/occurrence-conversation-upload-expire/domain/occurrence-conversation-upload-expire.constant.js'
import { JOB_CATALOG } from '../../src/shared/job-catalog.constant.js'

const NOW = new Date('2026-09-25T15:00:00.000Z')

function context(): JobRoutineContext {
  return {
    correlationId: 'conversation-upload-expire-contract',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_JOB,
    origin: 'schedule',
  }
}

describe('expiração do pedido de upload do anexo da conversa (spec 183 T702c2)', () => {
  test('o nome é o do catálogo, e a folga é a da janela de upload da API (900s)', () => {
    expect(OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_JOB).toBe('occurrence-conversation.upload.expire')
    expect(JOB_CATALOG.map((entry) => entry.job)).toContain(
      OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_JOB,
    )
    expect(OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS).toBe(900)
  })

  test('corte deslocado pela folga; lotes até não sobrar candidato; o log só conta', async () => {
    const asked: { before: Date; limit: number }[] = []
    const logs: unknown[][] = []
    const answers = [
      {
        expired: 3,
        failed: 0,
        missing: 1,
        processed: OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE,
      },
      { expired: 0, failed: 0, missing: 2, processed: 2 },
      { expired: 0, failed: 0, missing: 0, processed: 0 },
    ]
    const routine = createOccurrenceConversationUploadExpireRoutine({
      expire: async (input) => {
        asked.push(input)
        return answers[asked.length - 1] ?? { expired: 0, failed: 0, missing: 0, processed: 0 }
      },
      logger: {
        debug: () => undefined,
        error: () => undefined,
        info: (...args: unknown[]) => void logs.push(args),
        warn: () => undefined,
      } as never,
      now: () => NOW,
    })

    const result = await routine.run(context())

    expect(asked).toHaveLength(3)
    expect(asked[0]).toEqual({
      before: new Date(NOW.getTime() - OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS * 1000),
      limit: OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE,
    })
    expect(result).toEqual({
      counters: { batches: 2, expired: 3, failed: 0, missing: 3 },
      outcome: 'succeeded',
    })
    expect(JSON.stringify(logs)).toInclude('occurrence_conversation_upload_expire_cycle_finished')
    expect(JSON.stringify(logs)).not.toInclude('occurrence-conversations/')
  })

  test('bucket fora do ar: para depois das falhas seguidas, sem varrer os lotes todos', async () => {
    let calls = 0
    const routine = createOccurrenceConversationUploadExpireRoutine({
      expire: async () => {
        calls += 1
        return { expired: 0, failed: 1, missing: 0, processed: 1 }
      },
      logger: {
        debug: () => undefined,
        error: () => undefined,
        info: () => undefined,
        warn: () => undefined,
      } as never,
      now: () => NOW,
    })

    await routine.run(context())

    expect(calls).toBe(OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES)
  })
})
