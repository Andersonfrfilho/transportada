/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  AGGREGATE_ATTACHMENT_EVENT_TYPE,
  aggregateAttachmentEnvelopeV1Schema,
} from '../../src/messaging/aggregate-attachment-envelope.schema.js'
import { buildAggregateAttachmentRabbitMqTopology } from '../../src/messaging/aggregate-attachment-rabbitmq-topology.js'

const VALID = {
  companyId: crypto.randomUUID(),
  correlationId: 'correlation-070',
  eventId: crypto.randomUUID(),
  occurredAt: new Date(0).toISOString(),
  payload: {
    attachmentId: crypto.randomUUID(),
    bucket: 'transportada-private',
    objectKey: 'tenants/x/aggregate-application-attachments/ccmei/y',
    type: 'ccmei',
  },
  type: AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED,
  version: 1,
} as const

describe('envelope do anexo do agregado', () => {
  test('aceita o envelope de referência', () => {
    expect(aggregateAttachmentEnvelopeV1Schema.parse(VALID)).toEqual(VALID)
  })

  /**
   * `security.md` §6: o job carrega referência, nunca o documento. `strictObject` é o que faz um
   * payload com bytes ser **recusado** em vez de trafegar — e o PDF de uma pessoa numa fila é PII em
   * repouso, num lugar sem prazo de descarte.
   */
  test('payload com os bytes do documento é recusado', () => {
    const result = aggregateAttachmentEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { ...VALID.payload, bytes: [1, 2, 3] },
    })

    expect(result.success).toBe(false)
  })

  /** Quem anexa é anônimo: um `actorId` aqui seria valor inventado viajando como verdade. */
  test('envelope com ator é recusado', () => {
    const result = aggregateAttachmentEnvelopeV1Schema.safeParse({
      ...VALID,
      actorId: crypto.randomUUID(),
    })

    expect(result.success).toBe(false)
  })

  test('a topologia tem main, retry e dead com o prefixo da fila', () => {
    const topology = buildAggregateAttachmentRabbitMqTopology({ queuePrefix: 'transportada' })

    expect(topology.exchange).toBe('transportada.aggregate-attachment.v1.main.exchange')
    expect(topology.queue).toBe('transportada.aggregate-attachment.v1.main.queue')
    expect(topology.retry?.queue).toBe('transportada.aggregate-attachment.v1.retry.queue')
    expect(topology.deadLetter?.queue).toBe('transportada.aggregate-attachment.v1.dead.queue')
  })
})
