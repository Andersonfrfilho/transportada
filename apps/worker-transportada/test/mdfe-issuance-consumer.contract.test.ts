/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { MDFE_PROCESSING_EVENT_TYPE } from '../src/messaging/mdfe-processing-envelope.schema.js'
import { startMdfeIssuanceConsumer } from '../src/runtime/mdfe-issuance-consumer.service.js'

const COMPANY_ID = '2a0b2f1e-2f6a-4e1c-9f2c-6b1f0a1d2e3f'
const MANIFEST_ID = '9c2b1a0d-3e4f-4a5b-8c7d-6e5f4a3b2c1d'
const ATTEMPT_ID = '4f3e2d1c-0b9a-4c8d-9e7f-1a2b3c4d5e6f'
const EVENT_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb'
const ACTOR_ID = '11111111-2222-4333-8444-555555555555'

const DECODE_FAILURE_LOG = 'mdfe_issuance_envelope_decode_failed'

const VALID_ENVELOPE = {
  actorId: ACTOR_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: EVENT_ID,
  occurredAt: '2026-07-29T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'fingerprint-1',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    manifestId: MANIFEST_ID,
    status: 'requested',
  },
  type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_ISSUE_REQUESTED,
  version: 1,
} as const

type LoggedMessage = { readonly message: string; readonly metadata: unknown }

type DeadLetterCall = Record<string, unknown>

type ConsumerFixture = {
  readonly deadLettered: DeadLetterCall[]
  readonly deliver: (value: unknown) => Promise<{ readonly type: string }>
  readonly executed: unknown[]
  readonly logged: LoggedMessage[]
}

async function createConsumerFixture(): Promise<ConsumerFixture> {
  const deadLettered: DeadLetterCall[] = []
  const executed: unknown[] = []
  const logged: LoggedMessage[] = []

  let decode: ((value: unknown) => unknown) | undefined
  let handler:
    | ((params: {
        readonly payload: never
        readonly retryCount: number
      }) => Promise<{ readonly type: string }>)
    | undefined

  await startMdfeIssuanceConsumer({
    config: { prefetch: 1 } as unknown as Parameters<typeof startMdfeIssuanceConsumer>[0]['config'],
    effect: {
      execute: async ({ envelope }) => {
        executed.push(envelope)
      },
    },
    logger: {
      error: (message: string, metadata: unknown) => logged.push({ message, metadata }),
      info: () => {},
      warn: () => {},
    } as unknown as Parameters<typeof startMdfeIssuanceConsumer>[0]['logger'],
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
    } as unknown as Parameters<typeof startMdfeIssuanceConsumer>[0]['provider'],
    repository: {
      hasProcessed: async () => false,
      markDeadLettered: async (params) => {
        deadLettered.push({ ...params })
      },
      markProcessed: async () => {},
      scheduleRetry: async () => {},
    },
    retryPolicyResolver: { resolve: async () => ({ backoffSeconds: [5], maxAttempts: 3 }) },
  })

  if (decode === undefined || handler === undefined) {
    throw new Error('MDFE_CONSUMER_NOT_REGISTERED')
  }

  const registeredDecode = decode
  const registeredHandler = handler

  return {
    deadLettered,
    deliver: async (value) =>
      registeredHandler({ payload: registeredDecode(value) as never, retryCount: 0 }),
    executed,
    logged,
  }
}

describe('MDF-e issuance consumer decode contract', () => {
  test('routes a valid envelope to the effect', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver(VALID_ENVELOPE)

    expect(result).toEqual({ type: 'ack' })
    expect(fixture.executed).toEqual([VALID_ENVELOPE])
  })

  test('dead-letters an envelope the schema refuses instead of dying inside the provider', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({ ...VALID_ENVELOPE, unexpectedField: 'from a newer api' })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.executed).toEqual([])
    expect(fixture.logged.map((entry) => entry.message)).toEqual([DECODE_FAILURE_LOG])
  })

  test('records the dead letter with the identifiers the broken envelope still carries', async () => {
    const fixture = await createConsumerFixture()

    await fixture.deliver({ ...VALID_ENVELOPE, unexpectedField: 'from a newer api' })

    expect(fixture.deadLettered).toEqual([
      {
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        eventId: EVENT_ID,
        manifestId: MANIFEST_ID,
        reason: expect.stringContaining('unexpectedField'),
      },
    ])
  })

  test('never leaks the refused envelope content into the dead letter reason', async () => {
    const fixture = await createConsumerFixture()

    await fixture.deliver({
      ...VALID_ENVELOPE,
      payload: { ...VALID_ENVELOPE.payload, status: 'requested-by-8f2c-secret' },
      unexpectedField: 'from a newer api',
    })

    expect(JSON.stringify(fixture.deadLettered)).not.toContain('8f2c-secret')
    expect(JSON.stringify(fixture.logged)).not.toContain('8f2c-secret')
  })

  test('still logs the refusal when the envelope has no identity to record', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({
      type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_ISSUE_REQUESTED,
    })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.deadLettered).toEqual([])
    expect(fixture.logged.map((entry) => entry.message)).toEqual([DECODE_FAILURE_LOG])
  })

  test('still dead-letters an event type outside the MDF-e issuance rail', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({
      ...VALID_ENVELOPE,
      type: 'transportada.nfe.import.requested',
    })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.executed).toEqual([])
  })
})
