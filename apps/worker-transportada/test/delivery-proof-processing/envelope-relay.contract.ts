/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF4/RF7: o envelope é referência (nunca bytes), versionado e estrito; o relay publica o
 * que a API gravou no outbox, no molde do anexo do agregado (070).
 */
import { describe, expect, test } from 'bun:test'

import { DeliveryProofOutboxRelayService } from '../../src/delivery-proof-processing/application/delivery-proof-outbox-relay.service.js'
import { DELIVERY_PROOF_PROCESSING_EVENT_TYPE } from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import type { DeliveryProofOutboxClaimedEntry } from '../../src/delivery-proof-processing/infrastructure/drizzle-delivery-proof-outbox.repository.js'
import {
  deliveryProofProcessingEnvelopeV1Schema,
  type DeliveryProofProcessingEnvelopeV1,
} from '../../src/messaging/delivery-proof-processing-envelope.schema.js'

const VALID = {
  companyId: crypto.randomUUID(),
  correlationId: 'correlation-265',
  eventId: crypto.randomUUID(),
  occurredAt: new Date(0).toISOString(),
  payload: {
    attachmentKey: 'attachment-1',
    objectKey: 'tenants/x/delivery-proofs/y/z',
    proofId: crypto.randomUUID(),
    variant: 'original',
  },
  type: DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED,
  version: 1,
} as const

describe('envelope do tratamento do comprovante', () => {
  test('aceita o envelope de referência, inclusive com a chave do anexo vazia (app antigo)', () => {
    expect(deliveryProofProcessingEnvelopeV1Schema.parse(VALID)).toEqual(VALID)
    expect(
      deliveryProofProcessingEnvelopeV1Schema.safeParse({
        ...VALID,
        payload: { ...VALID.payload, attachmentKey: '' },
      }).success,
    ).toBe(true)
  })

  /** `security.md` §6: foto de canhoto numa fila é dado de terceiro em repouso, sem prazo de descarte. */
  test('payload com os bytes da foto é recusado', () => {
    const result = deliveryProofProcessingEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { ...VALID.payload, bytes: [1, 2, 3] },
    })

    expect(result.success).toBe(false)
  })

  test('só a variante original gera evento: o reduced segue na rotina agendada', () => {
    const result = deliveryProofProcessingEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { ...VALID.payload, variant: 'reduced' },
    })

    expect(result.success).toBe(false)
  })

  test('versão e tipo desconhecidos são recusados', () => {
    expect(
      deliveryProofProcessingEnvelopeV1Schema.safeParse({ ...VALID, version: 2 }).success,
    ).toBe(false)
    expect(
      deliveryProofProcessingEnvelopeV1Schema.safeParse({ ...VALID, type: 'outro' }).success,
    ).toBe(false)
  })
})

describe('relay do outbox do comprovante', () => {
  const entry: DeliveryProofOutboxClaimedEntry = {
    attachmentKey: 'attachment-1',
    claimOwner: 'relay-1',
    companyId: VALID.companyId,
    correlationId: 'correlation-265',
    eventId: VALID.eventId,
    objectKey: 'tenants/x/delivery-proofs/y/z',
    occurredAt: new Date(0).toISOString(),
    proofId: VALID.payload.proofId,
    variant: 'original',
  }

  function build(options: { readonly publishFails?: boolean } = {}) {
    const published: DeliveryProofProcessingEnvelopeV1[] = []
    const marked: string[] = []
    const relay = new DeliveryProofOutboxRelayService({
      clock: { now: () => new Date('2026-10-14T12:00:00.000Z') },
      publisher: {
        async publish({ envelope }) {
          if (options.publishFails === true) throw new Error('broker down')
          published.push(envelope)
        },
      },
      repository: {
        async claimDueEntries() {
          return [entry, { ...entry, claimOwner: 'someone-else', eventId: crypto.randomUUID() }]
        },
        async markPublished(params) {
          marked.push(params.eventId)
        },
      },
      retryPolicy: {
        classify(error: unknown): never {
          throw error
        },
      },
    })
    return { marked, published, relay }
  }

  test('publica um envelope válido com a referência do outbox e marca publicado', async () => {
    const { marked, published, relay } = build()

    const result = await relay.relayDueEntries({
      claimOwner: 'relay-1',
      leaseMs: 30_000,
      limit: 25,
    })

    expect(result).toEqual({ claimedCount: 2, publishedCount: 1 })
    expect(published).toHaveLength(1)
    expect(deliveryProofProcessingEnvelopeV1Schema.parse(published[0])).toEqual(published[0]!)
    expect(published[0]?.payload).toEqual({
      attachmentKey: 'attachment-1',
      objectKey: 'tenants/x/delivery-proofs/y/z',
      proofId: VALID.payload.proofId,
      variant: 'original',
    })
    // Só o que este relay reivindicou é marcado: a linha do outro dono fica para ele.
    expect(marked).toEqual([entry.eventId])
  })

  test('falha ao publicar não marca publicado: o lease expira e outro ciclo repete', async () => {
    const { marked, relay } = build({ publishFails: true })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-1', leaseMs: 30_000, limit: 25 }),
    ).rejects.toThrow('broker down')

    expect(marked).toEqual([])
  })
})
