/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 T013: a CNH da ficha do motorista entra no trilho de leitura do anexo do agregado, e o
 * que separa as duas filas é o `subject` do envelope — ele decide em que tabela a leitura cai.
 */
import { describe, expect, test } from 'bun:test'

import { AggregateAttachmentOutboxRelayService } from '../../src/aggregate-attachment/application/aggregate-attachment-outbox-relay.service.js'
import { extractAttachmentFields } from '../../src/aggregate-attachment/application/extract-attachment-fields.use-case.js'
import {
  AGGREGATE_ATTACHMENT_EVENT_TYPE,
  aggregateAttachmentEnvelopeV1Schema,
  type AggregateAttachmentEnvelopeV1,
} from '../../src/messaging/aggregate-attachment-envelope.schema.js'

const COMPANY_ID = crypto.randomUUID()
const ATTACHMENT_ID = crypto.randomUUID()

function buildEnvelope(
  subject?: 'aggregate_application' | 'fleet_driver',
): AggregateAttachmentEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'correlation-091',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: {
      attachmentId: ATTACHMENT_ID,
      bucket: 'test-bucket',
      objectKey: `tenants/${COMPANY_ID}/fleet-driver-attachments/d/cnh/o`,
      ...(subject === undefined ? {} : { subject }),
      type: 'cnh',
    },
    type: AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED,
    version: 1,
  }
}

function buildWriteBack(target: string, calls: string[]) {
  return {
    saveExtractedFields: async () => {
      calls.push(target)
    },
  }
}

const reader = { read: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]) }
const extraction = { extract: async () => ({ licenseNumber: '01234567890' }) }

describe('envelope do anexo — de quem é', () => {
  test('o subject é opcional, e só aceita as duas filas conhecidas', () => {
    expect(aggregateAttachmentEnvelopeV1Schema.safeParse(buildEnvelope()).success).toBe(true)
    expect(
      aggregateAttachmentEnvelopeV1Schema.safeParse(buildEnvelope('fleet_driver')).success,
    ).toBe(true)

    const unknown = buildEnvelope()
    const result = aggregateAttachmentEnvelopeV1Schema.safeParse({
      ...unknown,
      payload: { ...unknown.payload, subject: 'outra_tabela' },
    })
    expect(result.success).toBe(false)
  })
})

describe('extração — onde a leitura é gravada', () => {
  test('anexo da ficha do motorista vai para a tabela do motorista, e só para ela', async () => {
    const calls: string[] = []

    const outcome = await extractAttachmentFields(buildEnvelope('fleet_driver'), {
      driverWriteBack: buildWriteBack('driver', calls),
      extraction,
      reader,
      writeBack: buildWriteBack('application', calls),
    })

    expect(outcome).toBe('extracted')
    expect(calls).toEqual(['driver'])
  })

  test('mensagem sem subject — as antigas da fila — continua na candidatura', async () => {
    const calls: string[] = []

    await extractAttachmentFields(buildEnvelope(), {
      driverWriteBack: buildWriteBack('driver', calls),
      extraction,
      reader,
      writeBack: buildWriteBack('application', calls),
    })

    expect(calls).toEqual(['application'])
  })

  /** Sem destino do motorista, gravar na candidatura seria escrever em linha de outra pessoa. */
  test('subject do motorista sem o destino configurado falha em vez de gravar na candidatura', async () => {
    const calls: string[] = []

    await expect(
      extractAttachmentFields(buildEnvelope('fleet_driver'), {
        extraction,
        reader,
        writeBack: buildWriteBack('application', calls),
      }),
    ).rejects.toThrow('write-back is not configured')

    expect(calls).toEqual([])
  })
})

describe('relay — o subject viaja no envelope', () => {
  async function relayOne(subject?: 'fleet_driver') {
    const published: AggregateAttachmentEnvelopeV1[] = []
    const service = new AggregateAttachmentOutboxRelayService({
      clock: { now: () => new Date(0) },
      publisher: {
        publish: async ({ envelope }) => {
          published.push(envelope)
        },
      },
      repository: {
        claimDueEntries: async ({ claimOwner }) => [
          {
            attachmentId: ATTACHMENT_ID,
            bucket: 'test-bucket',
            claimOwner,
            companyId: COMPANY_ID,
            correlationId: 'correlation-091',
            eventId: crypto.randomUUID(),
            objectKey: 'tenants/x/fleet-driver-attachments/d/cnh/o',
            occurredAt: new Date(0).toISOString(),
            type: 'cnh',
          },
        ],
        markPublished: async () => undefined,
      },
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('publish failed')
        },
      },
      ...(subject === undefined ? {} : { subject }),
    })
    await service.relayDueEntries({ claimOwner: 'test', leaseMs: 1000, limit: 1 })
    return published[0]
  }

  test('o relay da ficha do motorista marca a fila; o da candidatura não muda o envelope', async () => {
    expect((await relayOne('fleet_driver'))?.payload.subject).toBe('fleet_driver')
    expect(Object.keys((await relayOne())?.payload ?? {})).not.toContain('subject')
  })
})
