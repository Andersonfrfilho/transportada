/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractAttachmentFields } from '../../src/aggregate-attachment/application/extract-attachment-fields.use-case.js'
import { AGGREGATE_ATTACHMENT_EVENT_TYPE } from '../../src/messaging/aggregate-attachment-envelope.schema.js'
import type { AggregateAttachmentEnvelopeV1 } from '../../src/messaging/aggregate-attachment-envelope.schema.js'

const COMPANY_ID = crypto.randomUUID()
const ATTACHMENT_ID = crypto.randomUUID()
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function buildEnvelope(): AggregateAttachmentEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'correlation-069',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: {
      attachmentId: ATTACHMENT_ID,
      bucket: 'test-bucket',
      objectKey: `tenants/${COMPANY_ID}/aggregate-application-attachments/ccmei/x`,
      type: 'ccmei',
    },
    type: AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED,
    version: 1,
  }
}

type SavedCall = {
  attachmentId: string
  companyId: string
  extractedFields: Readonly<Record<string, unknown>> | null
}

function buildDependencies(overrides?: {
  readonly bytes?: Uint8Array | undefined
  readonly fields?: Readonly<Record<string, unknown>> | null
}) {
  const saved: SavedCall[] = []

  return {
    dependencies: {
      extraction: {
        extract: async () => overrides?.fields ?? null,
      },
      reader: {
        read: async () => ('bytes' in (overrides ?? {}) ? overrides?.bytes : PDF_BYTES),
      },
      writeBack: {
        saveExtractedFields: async (input: SavedCall) => {
          saved.push(input)
        },
      },
    },
    saved,
  }
}

describe('extração do anexo — no worker, nunca na requisição', () => {
  test('grava o que foi lido, no anexo da empresa do envelope', async () => {
    const { dependencies, saved } = buildDependencies({ fields: { legalName: 'ACME MEI' } })

    const outcome = await extractAttachmentFields(buildEnvelope(), dependencies)

    expect(outcome).toBe('extracted')
    expect(saved).toEqual([
      {
        attachmentId: ATTACHMENT_ID,
        companyId: COMPANY_ID,
        extractedFields: { legalName: 'ACME MEI' },
      },
    ])
  })

  /**
   * Nada reconhecido é **resultado**, não falha: o documento pode não ser CCMEI, e reciclar a
   * mensagem por isso a manteria voltando para sempre por um fato que não vai mudar.
   */
  test('leitura que não reconhece nada fecha o ciclo gravando nulo', async () => {
    const { dependencies, saved } = buildDependencies({ fields: null })

    const outcome = await extractAttachmentFields(buildEnvelope(), dependencies)

    expect(outcome).toBe('extracted')
    expect(saved[0]?.extractedFields).toBeNull()
  })

  /** Objeto apagado entre o `201` e a leitura é fato do mundo: fecha sem escrever, não recicla. */
  test('objeto ausente não vira escrita', async () => {
    const { dependencies, saved } = buildDependencies({ bytes: undefined })

    const outcome = await extractAttachmentFields(buildEnvelope(), dependencies)

    expect(outcome).toBe('object_missing')
    expect(saved).toEqual([])
  })

  /** Falha de parse é defeito nosso e sobe: quem decide reciclar é o consumidor. */
  test('falha da extração propaga em vez de gravar leitura vazia', async () => {
    const { dependencies, saved } = buildDependencies()

    await expect(
      extractAttachmentFields(buildEnvelope(), {
        ...dependencies,
        extraction: {
          extract: async () => {
            throw new Error('thread morreu')
          },
        },
      }),
    ).rejects.toThrow()
    expect(saved).toEqual([])
  })

  /** Repetir a mesma mensagem converge no mesmo valor — a idempotência é a própria escrita. */
  test('reentrega grava o mesmo valor', async () => {
    const { dependencies, saved } = buildDependencies({ fields: { legalName: 'ACME MEI' } })
    const envelope = buildEnvelope()

    await extractAttachmentFields(envelope, dependencies)
    await extractAttachmentFields(envelope, dependencies)

    expect(saved[0]).toEqual(saved[1] as SavedCall)
  })
})
