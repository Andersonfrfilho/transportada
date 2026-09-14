/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { RabbitMqConsumeParams, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { CargoLayoutHandlerPorts } from '../../src/cargo-layout/application/cargo-layout-handler.service.js'
import { CARGO_LAYOUT_EVENT_TYPE } from '../../src/messaging/cargo-layout-envelope.schema.js'
import {
  CARGO_LAYOUT_PREFETCH,
  decodeCargoLayoutJob,
  startCargoLayoutConsumer,
} from '../../src/runtime/cargo-layout-consumer.service.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'
import { buildStoredCargoLayoutInput } from '../fixtures/cargo-layout-input.fixture.js'

const ENVELOPE = {
  companyId: '00000000-0000-4000-8000-000000000001',
  correlationId: 'correlation-1',
  eventId: '00000000-0000-4000-8000-000000000003',
  occurredAt: '2026-09-12T12:00:00.000Z',
  payload: {
    inputHash: 'b'.repeat(64),
    layoutId: '00000000-0000-4000-8000-000000000002',
  },
  type: CARGO_LAYOUT_EVENT_TYPE.REQUESTED,
  version: 1,
} as const

type LogEntry = { readonly message: string; readonly metadata: unknown }

function buildHarness(overrides: Partial<CargoLayoutHandlerPorts> = {}) {
  const logs: LogEntry[] = []
  const budgets: number[] = []
  let captured: RabbitMqConsumeParams<unknown> | undefined

  const logger = {
    error: (message: string, metadata: unknown) => logs.push({ message, metadata }),
    info: (message: string, metadata: unknown) => logs.push({ message, metadata }),
    warn: (message: string, metadata: unknown) => logs.push({ message, metadata }),
  } as unknown as WorkerLogger

  const provider = {
    async consume(params: RabbitMqConsumeParams<unknown>) {
      captured = params
      return { cancel: async () => undefined, consumerTag: 'cargo-layout' }
    },
  } as unknown as RabbitMqProvider

  const ports: CargoLayoutHandlerPorts = {
    claim: async () => ({ attempt: 1, input: buildStoredCargoLayoutInput({ stopCount: 1 }) }),
    complete: async () => undefined,
    compute: async ({ budgetMs }) => {
      budgets.push(budgetMs)
      return null
    },
    fail: async () => undefined,
    now: () => new Date('2026-09-12T12:00:00.000Z'),
    release: async () => undefined,
    ...overrides,
  }

  return {
    budgets,
    captured: () => {
      if (captured === undefined) throw new Error('consumer not started')
      return captured
    },
    logs,
    start: () =>
      startCargoLayoutConsumer({ baseBudgetMs: 60_000, logger, maxAttempts: 3, ports, provider }),
  }
}

function deliver(params: RabbitMqConsumeParams<unknown>, retryCount: number) {
  return params.handler({
    headers: {},
    payload: params.decode(ENVELOPE),
    redelivered: retryCount > 0,
    retryCount,
  })
}

describe('consumidor da planta de carga (spec 145 D8)', () => {
  test('decodifica o envelope v1 na referência do job', () => {
    expect(decodeCargoLayoutJob(ENVELOPE)).toEqual({
      companyId: ENVELOPE.companyId,
      correlationId: ENVELOPE.correlationId,
      inputHash: ENVELOPE.payload.inputHash,
      layoutId: ENVELOPE.payload.layoutId,
    })
  })

  test('recusa envelope inválido: payload engordado, versão errada, não objeto', () => {
    expect(() =>
      decodeCargoLayoutJob({ ...ENVELOPE, payload: { ...ENVELOPE.payload, label: 'Rua X' } }),
    ).toThrow()
    expect(() => decodeCargoLayoutJob({ ...ENVELOPE, version: 2 })).toThrow()
    expect(() => decodeCargoLayoutJob('texto')).toThrow()
  })

  test('consome uma mensagem por vez', async () => {
    const harness = buildHarness()

    await harness.start()

    expect(CARGO_LAYOUT_PREFETCH).toBe(1)
    expect(harness.captured().prefetch).toBe(1)
  })

  test('retryCount vira tentativa, e a tentativa escolhe o degrau do orçamento', async () => {
    const harness = buildHarness()
    await harness.start()

    await deliver(harness.captured(), 0)
    await deliver(harness.captured(), 2)

    expect(harness.budgets).toEqual([60_000, 240_000])
  })

  test('loga só referência opaca: layoutId, tentativa e disposição', async () => {
    const harness = buildHarness()
    await harness.start()

    expect(await deliver(harness.captured(), 1)).toEqual({ type: 'ack' })
    expect(harness.logs).toEqual([
      {
        message: 'cargo_layout_handled',
        metadata: { attempt: 2, disposition: 'ack', layoutId: ENVELOPE.payload.layoutId },
      },
    ])
    expect(JSON.stringify(harness.logs)).not.toContain('Parada')
    expect(JSON.stringify(harness.logs)).not.toContain('Cliente')
  })

  test('falha do próprio handler (claim com banco fora) devolve a mensagem', async () => {
    const harness = buildHarness({
      claim: async () => {
        throw new Error('connection refused')
      },
    })
    await harness.start()

    expect(await deliver(harness.captured(), 0)).toEqual({ type: 'retry' })
    expect(harness.logs).toEqual([
      {
        message: 'cargo_layout_handler_failed',
        metadata: { attempt: 1, layoutId: ENVELOPE.payload.layoutId, reason: 'Error' },
      },
    ])
  })
})
