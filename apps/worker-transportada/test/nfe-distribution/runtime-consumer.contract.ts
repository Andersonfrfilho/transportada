/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { startNfeDistributionConsumer } from '../../src/runtime/nfe-distribution-consumer.service.js'
import type { NfeProcessingEnvelopeV1 } from '../../src/messaging/nfe-processing-envelope.schema.js'
import type { WorkerEnvironment, WorkerLogger } from '../../src/shared/worker.types.js'
import { DISTRIBUTION_ENVELOPE } from './nfe-distribution.fixture.js'

type ConsumeArgs = {
  readonly decode: (value: unknown) => NfeProcessingEnvelopeV1
  readonly handler: (message: {
    readonly payload: NfeProcessingEnvelopeV1
    readonly retryCount?: number
  }) => Promise<{ readonly type: string }>
  readonly prefetch: number
}

const LOGGER: WorkerLogger = { error() {}, info() {}, warn() {} }
const COMPLETED_RESULT = {
  duplicatedCount: 0,
  fetchedCount: 3,
  persistedCount: 3,
  status: 'completed' as const,
  ultNsu: '000000000000051',
}

function messageKey(envelope: NfeProcessingEnvelopeV1): string {
  return `${envelope.companyId}:${envelope.eventId}:${envelope.payload.importId}`
}

async function startWithCapture(input: {
  readonly consumer: {
    execute(params: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<unknown>
  }
  readonly repository: {
    hasProcessed(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }): Promise<boolean>
    markDeadLettered(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly reason: string
    }): Promise<void>
    markProcessed(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }): Promise<void>
    scheduleRetry(key: {
      readonly attempt: number
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly nextAttemptAt: Date
    }): Promise<void>
  }
}): Promise<ConsumeArgs> {
  let captured: ConsumeArgs | undefined
  const provider = {
    async consume(args: ConsumeArgs) {
      captured = args
      return { cancel: async () => undefined }
    },
  } as unknown as RabbitMqProvider

  await startNfeDistributionConsumer({
    config: { prefetch: 7 } as unknown as WorkerEnvironment,
    consumer: input.consumer,
    logger: LOGGER,
    provider,
    repository: input.repository,
  })

  if (captured === undefined) {
    throw new Error('consumer registration did not capture consume args')
  }
  return captured
}

function createRepository(calls: string[], processed = new Set<string>()) {
  return {
    async hasProcessed(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }) {
      calls.push(`hasProcessed:${key.companyId}:${key.eventId}:${key.importId}`)
      return processed.has(`${key.companyId}:${key.eventId}:${key.importId}`)
    },
    async markDeadLettered(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly reason: string
    }) {
      calls.push(`markDeadLettered:${key.companyId}:${key.eventId}:${key.importId}:${key.reason}`)
    },
    async markProcessed(key: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }) {
      calls.push(`markProcessed:${key.companyId}:${key.eventId}:${key.importId}`)
    },
    async scheduleRetry(key: {
      readonly attempt: number
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly nextAttemptAt: Date
    }) {
      calls.push(`scheduleRetry:${key.companyId}:${key.eventId}:${key.importId}:${key.attempt}`)
    },
  }
}

describe('NF-e distribution runtime consumer contract', () => {
  test('decodes with the processing envelope schema and forwards the configured prefetch', async () => {
    const captured = await startWithCapture({
      consumer: {
        async execute() {
          return COMPLETED_RESULT
        },
      },
      repository: createRepository([]),
    })

    expect(captured.prefetch).toBe(7)
    expect(captured.decode(DISTRIBUTION_ENVELOPE)).toEqual(DISTRIBUTION_ENVELOPE)
    expect(() => captured.decode({ type: 'garbage' })).toThrow()
  })

  test('runs the distribution consumer once and marks the trigger processed before ack', async () => {
    const calls: string[] = []
    const captured = await startWithCapture({
      consumer: {
        async execute(params) {
          calls.push(`execute:${params.envelope.eventId}`)
          return COMPLETED_RESULT
        },
      },
      repository: createRepository(calls),
    })

    await expect(
      captured.handler({ payload: DISTRIBUTION_ENVELOPE, retryCount: 0 }),
    ).resolves.toEqual({ type: 'ack' })

    expect(calls).toEqual([
      `hasProcessed:${messageKey(DISTRIBUTION_ENVELOPE)}`,
      `execute:${DISTRIBUTION_ENVELOPE.eventId}`,
      `markProcessed:${messageKey(DISTRIBUTION_ENVELOPE)}`,
    ])
  })

  test('acks a redelivered trigger without re-running the SEFAZ pull', async () => {
    const calls: string[] = []
    const captured = await startWithCapture({
      consumer: {
        async execute() {
          calls.push('execute')
          return COMPLETED_RESULT
        },
      },
      repository: createRepository(calls, new Set([messageKey(DISTRIBUTION_ENVELOPE)])),
    })

    await expect(
      captured.handler({ payload: DISTRIBUTION_ENVELOPE, retryCount: 1 }),
    ).resolves.toEqual({ type: 'ack' })

    expect(calls).toEqual([`hasProcessed:${messageKey(DISTRIBUTION_ENVELOPE)}`])
  })

  test('dead-letters an envelope whose type is not a distribution request', async () => {
    const calls: string[] = []
    const captured = await startWithCapture({
      consumer: {
        async execute() {
          calls.push('execute')
          return COMPLETED_RESULT
        },
      },
      repository: createRepository(calls),
    })

    const importEnvelope: NfeProcessingEnvelopeV1 = {
      ...DISTRIBUTION_ENVELOPE,
      type: 'transportada.nfe.import.requested',
    }

    await expect(captured.handler({ payload: importEnvelope, retryCount: 0 })).resolves.toEqual({
      type: 'dead-letter',
    })

    expect(calls).toEqual([])
  })
})
