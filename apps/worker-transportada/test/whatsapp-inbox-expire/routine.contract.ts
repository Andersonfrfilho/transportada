/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import type { ExpireDueWhatsAppChats } from '../../src/whatsapp-inbox-expire/application/whatsapp-inbox-expire.port.js'
import { createWhatsAppInboxExpireRoutine } from '../../src/whatsapp-inbox-expire/application/whatsapp-inbox-expire.routine.js'
import {
  WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE,
  WHATSAPP_INBOX_CHAT_EXPIRE_JOB,
  WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES,
} from '../../src/whatsapp-inbox-expire/domain/whatsapp-inbox-expire.constant.js'

const NOW = new Date('2026-11-11T12:00:00.000Z')

type LoggedCall = readonly unknown[]

function buildLogger(calls: LoggedCall[] = []) {
  const record = (...args: unknown[]) => {
    calls.push(args)
  }
  return { debug: record, error: record, info: record, warn: record }
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'whatsapp-inbox-expire-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: WHATSAPP_INBOX_CHAT_EXPIRE_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(expire: ExpireDueWhatsAppChats, calls: LoggedCall[] = []) {
  return createWhatsAppInboxExpireRoutine({
    expire,
    logger: buildLogger(calls) as never,
    now: () => NOW,
  })
}

describe('devolução das conversas vencidas do WhatsApp (spec 319 T7)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(WHATSAPP_INBOX_CHAT_EXPIRE_JOB).toBe('whatsapp-inbox.chat.expire')
  })

  test('sem conversa vencida, fecha succeeded sem devolver nada', async () => {
    const result = await buildRoutine(async () => 0).run(buildContext())
    expect(result).toEqual({ counters: { batches: 0, released: 0 }, outcome: 'succeeded' })
  })

  test('um lote curto encerra o ciclo e passa o relógio da rotina ao repositório', async () => {
    const asked: Array<{ readonly limit: number; readonly now: Date }> = []
    const result = await buildRoutine(async (input) => {
      asked.push(input)
      return 3
    }).run(buildContext())

    expect(result).toEqual({ counters: { batches: 1, released: 3 }, outcome: 'succeeded' })
    expect(asked).toEqual([{ limit: WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE, now: NOW }])
  })

  test('lote cheio pede o próximo até sobrar menos que o lote', async () => {
    const answers = [WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE, 7]
    let calls = 0
    const result = await buildRoutine(async () => answers[calls++] ?? 0).run(buildContext())

    expect(calls).toBe(2)
    expect(result.counters).toEqual({
      batches: 2,
      released: WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE + 7,
    })
  })

  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const result = await buildRoutine(async () => {
      calls += 1
      return WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE
    }).run(buildContext(() => calls >= 2))

    expect(calls).toBe(2)
    expect(result.counters.batches).toBe(2)
    expect(result.outcome).toBe('succeeded')
  })

  test('no teto de lotes o resto espera a próxima batida, e o log diz que sobrou', async () => {
    let calls = 0
    const logged: LoggedCall[] = []
    const result = await buildRoutine(async () => {
      calls += 1
      return WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE
    }, logged).run(buildContext())

    expect(calls).toBe(WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES)
    expect(result.counters.batches).toBe(WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  test('o log do ciclo leva só contagens e os ids da execução', async () => {
    const logged: LoggedCall[] = []
    await buildRoutine(async () => 2, logged).run(buildContext())

    const serialized = JSON.stringify(logged)
    expect(serialized).toContain('whatsapp_inbox_chat_expire_cycle_finished')
    expect(serialized).toContain('"released":2')
    expect(serialized).not.toContain('@s.whatsapp.net')
    expect(serialized).not.toContain('chatJid')
  })
})
