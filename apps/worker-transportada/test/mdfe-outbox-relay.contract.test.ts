/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { MdfeOutboxRelayService } from '../src/mdfe-issuance/application/mdfe-outbox-relay.service.js'
import {
  mdfeProcessingEnvelopeV1Schema,
  type MdfeProcessingEnvelopeV1,
} from '../src/messaging/mdfe-processing-envelope.schema.js'

const ACTOR_ID = '00000000-0000-4000-8000-000000000003'
const ATTEMPT_ID = 'c9db1ed2-37d1-4d44-8e50-4a711fc16240'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const EVENT_ID = 'de2c2e0a-6368-49ff-8126-7c751e999de9'
const MANIFEST_ID = '4ef75fa1-ed1b-4f14-8280-442c3f8cf40f'
const now = new Date('2026-07-29T00:59:09.761Z')

describe('MDF-e outbox relay contract', () => {
  it('publishes an envelope that satisfies the versioned contract', async () => {
    const published: MdfeProcessingEnvelopeV1[] = []
    const relay = createRelay(published)

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-mdfe-a', leaseMs: 30_000, limit: 10 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })

    expect(() => mdfeProcessingEnvelopeV1Schema.parse(published[0])).not.toThrow()
  })

  it('carries the attempt status recorded on the outbox row', async () => {
    const published: MdfeProcessingEnvelopeV1[] = []
    const relay = createRelay(published)

    await relay.relayDueEntries({ claimOwner: 'relay-mdfe-a', leaseMs: 30_000, limit: 10 })

    expect(published[0]?.payload).toEqual({
      attemptFingerprint: 'mdfefingerprint-001',
      attemptId: ATTEMPT_ID,
      attemptKind: 'issue',
      manifestId: MANIFEST_ID,
      status: 'requested',
    })
  })
})

function createRelay(published: MdfeProcessingEnvelopeV1[]): MdfeOutboxRelayService {
  return new MdfeOutboxRelayService({
    clock: { now: () => now },
    publisher: {
      async publish(params: { readonly envelope: MdfeProcessingEnvelopeV1 }) {
        published.push(params.envelope)
      },
    },
    repository: {
      async claimDueEntries(params: { readonly claimOwner: string }) {
        return [
          {
            actorId: ACTOR_ID,
            aggregateId: MANIFEST_ID,
            attemptFingerprint: 'mdfefingerprint-001',
            attemptId: ATTEMPT_ID,
            attemptKind: 'issue' as const,
            claimOwner: params.claimOwner,
            companyId: COMPANY_ID,
            correlationId: 'contract-test-correlation',
            eventId: EVENT_ID,
            eventType: 'transportada.mdfe.manifest.issue.requested' as const,
            eventVersion: 1 as const,
            manifestId: MANIFEST_ID,
            occurredAt: now.toISOString(),
            status: 'requested',
          },
        ]
      },
      async markPublished() {},
    },
    retryPolicy: {
      classify(error: unknown) {
        throw error
      },
    },
  })
}
