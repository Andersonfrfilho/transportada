/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { JOB_RUN_EVENT_TYPE } from '../../src/messaging/job-run-envelope.schema.js'
import { startJobRunConsumer } from '../../src/runtime/job-run-consumer.service.js'

const EVENT_ID = '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c'
const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const DECODE_FAILURE_LOG = 'job_run_envelope_decode_failed'

const VALID_ENVELOPE = {
  correlationId: 'tick-2026-08-23T09:00:00.000Z',
  eventId: EVENT_ID,
  occurredAt: '2026-08-23T09:00:00.000Z',
  payload: { executionId: EXECUTION_ID, job: 'fuel.price.pull', origin: 'schedule' },
  type: JOB_RUN_EVENT_TYPE,
  version: 1,
} as const

type LoggedMessage = { readonly message: string; readonly metadata: unknown }

type ConsumerFixture = {
  readonly deliver: (value: unknown) => Promise<{ readonly type: string }>
  readonly logged: LoggedMessage[]
  readonly ran: unknown[]
}

async function createConsumerFixture(): Promise<ConsumerFixture> {
  const logged: LoggedMessage[] = []
  const ran: unknown[] = []

  let decode: ((value: unknown) => unknown) | undefined
  let handler:
    | ((params: {
        readonly payload: never
        readonly retryCount: number
      }) => Promise<{ readonly type: string }>)
    | undefined

  await startJobRunConsumer({
    config: { prefetch: 1 } as unknown as Parameters<typeof startJobRunConsumer>[0]['config'],
    cycle: {
      run: async ({ envelope }) => {
        ran.push(envelope)
        return { claimed: true, outcome: 'succeeded' }
      },
    },
    logger: {
      debug: () => {},
      error: (message: string, metadata: unknown) => logged.push({ message, metadata }),
      info: () => {},
      warn: () => {},
    } as unknown as Parameters<typeof startJobRunConsumer>[0]['logger'],
    provider: {
      consume: async (params: {
        readonly decode: (value: unknown) => unknown
        readonly handler: (params: {
          readonly payload: never
          readonly retryCount: number
        }) => Promise<{ readonly type: string }>
      }) => {
        decode = params.decode
        handler = params.handler
        return { cancel: async () => {} }
      },
    } as unknown as Parameters<typeof startJobRunConsumer>[0]['provider'],
  })

  if (decode === undefined || handler === undefined) {
    throw new Error('JOB_RUN_CONSUMER_NOT_REGISTERED')
  }

  const registeredDecode = decode
  const registeredHandler = handler

  return {
    deliver: async (value) =>
      registeredHandler({ payload: registeredDecode(value) as never, retryCount: 0 }),
    logged,
    ran,
  }
}

describe('job run consumer', () => {
  test('entrega o envelope válido ao ciclo e confirma a mensagem', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver(VALID_ENVELOPE)

    expect(result).toEqual({ type: 'ack' })
    expect(fixture.ran).toEqual([VALID_ENVELOPE])
  })

  test('envelope recusado pelo schema vai para a dead em vez de morrer dentro do provedor', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({ ...VALID_ENVELOPE, companyId: EVENT_ID })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.ran).toEqual([])
    expect(fixture.logged.map((entry) => entry.message)).toEqual([DECODE_FAILURE_LOG])
  })

  test('a razão da recusa nomeia o campo, nunca o conteúdo do envelope', async () => {
    const fixture = await createConsumerFixture()

    await fixture.deliver({
      ...VALID_ENVELOPE,
      correlationId: 'tick-com-segredo-8f2c',
      companyId: EVENT_ID,
    })

    expect(JSON.stringify(fixture.logged)).toContain('companyId')
    expect(JSON.stringify(fixture.logged)).not.toContain('8f2c')
  })

  test('evento de outro trilho não é executado aqui', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({
      ...VALID_ENVELOPE,
      type: 'transportada.nfe.import.requested',
    })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.ran).toEqual([])
  })
})
