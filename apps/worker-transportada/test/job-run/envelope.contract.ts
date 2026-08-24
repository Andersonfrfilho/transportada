/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  JOB_RUN_EVENT_TYPE,
  JOB_RUN_QUEUE_ROUTE,
  jobRunEnvelopeV1Schema,
} from '../../src/messaging/job-run-envelope.schema.js'

const EVENT_ID = '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c'
const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const VALID_ENVELOPE = {
  correlationId: 'tick-2026-08-23T09:00:00.000Z',
  eventId: EVENT_ID,
  occurredAt: '2026-08-23T09:00:00.000Z',
  payload: {
    executionId: EXECUTION_ID,
    job: 'fuel.price.pull',
    origin: 'schedule',
  },
  type: JOB_RUN_EVENT_TYPE,
  version: 1,
} as const

describe('job run envelope v1', () => {
  test('aceita o envelope que o cron publica', () => {
    const parsed = jobRunEnvelopeV1Schema.parse(VALID_ENVELOPE)

    expect(parsed.payload.executionId).toBe(EXECUTION_ID)
    expect(parsed.payload.job).toBe('fuel.price.pull')
    expect(parsed.payload.origin).toBe('schedule')
  })

  test('aceita a origem manual, que é o botão do painel', () => {
    const parsed = jobRunEnvelopeV1Schema.parse({
      ...VALID_ENVELOPE,
      payload: { ...VALID_ENVELOPE.payload, origin: 'manual' },
    })

    expect(parsed.payload.origin).toBe('manual')
  })

  test('recusa rotina fora do catálogo — o nome é chave, não texto livre', () => {
    const parsed = jobRunEnvelopeV1Schema.safeParse({
      ...VALID_ENVELOPE,
      payload: { ...VALID_ENVELOPE.payload, job: 'fuel.price.pull.v2' },
    })

    expect(parsed.success).toBe(false)
  })

  test('recusa campo desconhecido — envelope estendido em silêncio é envelope divergente', () => {
    const parsed = jobRunEnvelopeV1Schema.safeParse({ ...VALID_ENVELOPE, companyId: EVENT_ID })

    expect(parsed.success).toBe(false)
  })

  test('recusa versão diferente de 1', () => {
    const parsed = jobRunEnvelopeV1Schema.safeParse({ ...VALID_ENVELOPE, version: 2 })

    expect(parsed.success).toBe(false)
  })

  test('recusa tipo de evento diferente', () => {
    const parsed = jobRunEnvelopeV1Schema.safeParse({
      ...VALID_ENVELOPE,
      type: 'transportada.job.run.finished',
    })

    expect(parsed.success).toBe(false)
  })

  test('recusa correlationId vazio — sem ele o ciclo não se acha no log', () => {
    const parsed = jobRunEnvelopeV1Schema.safeParse({ ...VALID_ENVELOPE, correlationId: '   ' })

    expect(parsed.success).toBe(false)
  })

  test('o nome da rota e do evento são literais, e mudá-los é migração de topologia', () => {
    expect(JOB_RUN_QUEUE_ROUTE).toBe('job-run.v1')
    expect(JOB_RUN_EVENT_TYPE).toBe('transportada.job.run.requested')
  })
})
