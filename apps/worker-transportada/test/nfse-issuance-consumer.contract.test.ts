/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NFSE_PROCESSING_EVENT_TYPE } from '../src/messaging/nfse-processing-envelope.schema.js'
import { startNfseIssuanceConsumer } from '../src/runtime/nfse-issuance-consumer.service.js'

const COMPANY_ID = '3b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const INVOICE_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const ATTEMPT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-4f5a6b7c8d9e'
const EVENT_ID = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f'
const ACTOR_ID = '8d9e0f1a-2b3c-4d4e-8f5a-6b7c8d9e0f1a'

const DECODE_FAILURE_LOG = 'nfse_issuance_envelope_decode_failed'

const VALID_ENVELOPE = {
  actorId: ACTOR_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: EVENT_ID,
  occurredAt: '2026-08-12T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'fingerprint-1',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    invoiceId: INVOICE_ID,
    status: 'requested',
  },
  type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_ISSUE_REQUESTED,
  version: 1,
} as const

type LoggedMessage = { readonly message: string; readonly metadata: unknown }

type ConsumerFixture = {
  readonly deadLettered: Record<string, unknown>[]
  readonly deliver: (value: unknown) => Promise<{ readonly type: string }>
  readonly executed: unknown[]
  readonly logged: LoggedMessage[]
}

async function createConsumerFixture(): Promise<ConsumerFixture> {
  const deadLettered: Record<string, unknown>[] = []
  const executed: unknown[] = []
  const logged: LoggedMessage[] = []

  let decode: ((value: unknown) => unknown) | undefined
  let handler:
    | ((params: {
        readonly payload: never
        readonly retryCount: number
      }) => Promise<{ readonly type: string }>)
    | undefined

  await startNfseIssuanceConsumer({
    config: { prefetch: 1 } as unknown as Parameters<typeof startNfseIssuanceConsumer>[0]['config'],
    effect: {
      execute: async ({ envelope }) => {
        executed.push(envelope)
      },
    },
    logger: {
      error: (message: string, metadata: unknown) => logged.push({ message, metadata }),
      info: () => {},
      warn: () => {},
    } as unknown as Parameters<typeof startNfseIssuanceConsumer>[0]['logger'],
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
    } as unknown as Parameters<typeof startNfseIssuanceConsumer>[0]['provider'],
    repository: {
      hasProcessed: async () => false,
      markDeadLettered: async (params) => {
        deadLettered.push({ ...params })
      },
      markProcessed: async () => {},
      scheduleRetry: async () => {},
    },
    retryPolicyResolver: { resolve: async () => ({ backoffSeconds: [30], maxAttempts: 5 }) },
  })

  if (decode === undefined || handler === undefined) {
    throw new Error('NFSE_CONSUMER_NOT_REGISTERED')
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

describe('NFS-e issuance consumer decode contract', () => {
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
        invoiceId: INVOICE_ID,
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
      type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_ISSUE_REQUESTED,
    })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.deadLettered).toEqual([])
    expect(fixture.logged.map((entry) => entry.message)).toEqual([DECODE_FAILURE_LOG])
  })

  test('still dead-letters an event type outside the NFS-e issuance rail', async () => {
    const fixture = await createConsumerFixture()

    const result = await fixture.deliver({
      ...VALID_ENVELOPE,
      type: 'transportada.mdfe.manifest.issue.requested',
    })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.executed).toEqual([])
  })

  test('accepts the cancellation envelope on the same rail', async () => {
    const fixture = await createConsumerFixture()

    const envelope = {
      ...VALID_ENVELOPE,
      payload: { ...VALID_ENVELOPE.payload, attemptKind: 'cancel', status: 'authorized' },
      type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_CANCEL_REQUESTED,
    }

    const result = await fixture.deliver(envelope)

    expect(result).toEqual({ type: 'ack' })
    expect(fixture.executed).toEqual([envelope])
  })
})
