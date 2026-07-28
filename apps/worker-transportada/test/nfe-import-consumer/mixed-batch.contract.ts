/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import {
  NFE_XML_IMPORT_ERROR_CODE,
  NfeXmlImportError,
  type ImportedNfeXml,
} from '@adatechnology/fiscal-provider'

import {
  type ExpandedXmlEntry,
  type NfeImportConsumerRepositoryPort,
  type NfeImportFinalStoragePort,
  type NfeImportSourceStoragePort,
  createNfeImportConsumerFixture,
} from './nfe-import-consumer.fixture.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const COMPANY_CNPJ = '12345678000190'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'

describe('NF-e import consumer contract', () => {
  it('processes XML variants independently, rejects unrelated CNPJ, keeps same-tenant duplicate tenant-scoped, and closes with a partial summary', async () => {
    const calls: string[] = []
    const sourceEntries = new Map<string, Uint8Array>([
      ['staging/authorized.xml', encodeXml('authorized')],
      ['staging/unsigned.xml', encodeXml('unsigned')],
      ['staging/event.xml', encodeXml('event')],
      ['staging/duplicate.xml', encodeXml('duplicate')],
      ['staging/invalid.xml', encodeXml('invalid')],
      ['staging/unrelated.xml', encodeXml('unrelated')],
      ['staging/foreign-event.xml', encodeXml('foreign-event')],
    ])
    const consumer = await createNfeImportConsumerFixture({
      archiveExpander: {
        async expand(input) {
          calls.push(`expand:${input.sourceName}`)
          return [
            {
              entryName: input.sourceEntry,
              sourceBytes: input.sourceBytes,
              sourceSha256: `sha-${input.sourceName}`,
            } satisfies ExpandedXmlEntry,
          ]
        },
      },
      finalStorage: createFinalStorage(calls),
      repository: createRepository(calls),
      sourceStorage: createSourceStorage(calls, sourceEntries),
      xmlImporter: {
        async importXml(input) {
          const key = new TextDecoder().decode(new TextEncoder().encode(input.xml))
          calls.push(`import:${key}`)
          if (key.includes('invalid')) {
            throw new NfeXmlImportError({
              code: NFE_XML_IMPORT_ERROR_CODE.invalidStructure,
              message: 'Unsupported XML structure',
            })
          }

          return createImportedXmlVariant(key)
        },
      },
    })

    await expect(
      consumer.execute({
        envelope: {
          actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
          companyId: COMPANY_ID,
          correlationId: 'contract-test-correlation',
          eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
          occurredAt: '2026-07-22T22:00:00.000Z',
          payload: { importId: IMPORT_ID },
          type: 'transportada.nfe.import.requested',
          version: 1,
        },
      }),
    ).resolves.toEqual({
      duplicatedCount: 1,
      failedCount: 0,
      id: IMPORT_ID,
      importedCount: 3,
      invalidCount: 1,
      processedCount: 7,
      receivedCount: 7,
      rejectedCount: 2,
      status: 'partially_processed',
    })

    expect(calls).toContain(`lookup:${COMPANY_ID}:35190730290856000160550010000000011000000010`)
    expect(calls).toContain(`lookup:${COMPANY_ID}:35190730290856000160550010000000011000000011`)
    expect(calls).toContain(`lookup:${COMPANY_ID}:35190712345678000190550010000000011000000012`)
    expect(calls.filter((call) => call.startsWith('store-document:'))).toHaveLength(2)
    expect(calls.filter((call) => call.startsWith('store-event:'))).toHaveLength(1)
    expect(calls).toContain('complete:item-4:duplicated')
    expect(calls).toContain('complete:item-5:invalid')
    expect(calls).toContain('complete:item-6:rejected')
    expect(calls).toContain('complete:item-7:rejected')
    expect(calls).toContain('finalize:partially_processed:3:1:1:2')
  })
})

function createRepository(calls: string[]): NfeImportConsumerRepositoryPort {
  return {
    async completeItem(input) {
      calls.push(`complete:${input.itemId}:${input.status}`)
    },
    async finalizeImport(input) {
      calls.push(
        `finalize:${input.summary.status}:${input.summary.importedCount}:${input.summary.duplicatedCount}:${input.summary.invalidCount}:${input.summary.rejectedCount}`,
      )
      return input.summary
    },
    async findExistingDocument(input) {
      calls.push(`lookup:${input.companyId}:${input.accessKey}`)
      if (input.accessKey === '35190730290856000160550010000000011000000013') {
        return { documentId: 'existing-document-13' }
      }
      return null
    },
    async getPendingImport() {
      return {
        companyCnpj: COMPANY_CNPJ,
        companyId: COMPANY_ID,
        id: IMPORT_ID,
        items: [
          createPendingItem('item-1', 'authorized.xml', 'staging/authorized.xml'),
          createPendingItem('item-2', 'unsigned.xml', 'staging/unsigned.xml'),
          createPendingItem('item-3', 'event.xml', 'staging/event.xml'),
          createPendingItem('item-4', 'duplicate.xml', 'staging/duplicate.xml'),
          createPendingItem('item-5', 'invalid.xml', 'staging/invalid.xml'),
          createPendingItem('item-6', 'unrelated.xml', 'staging/unrelated.xml'),
          createPendingItem('item-7', 'foreign-event.xml', 'staging/foreign-event.xml'),
        ],
      }
    },
  }
}

function createSourceStorage(
  calls: string[],
  sourceEntries: ReadonlyMap<string, Uint8Array>,
): NfeImportSourceStoragePort {
  return {
    async readSource(input) {
      calls.push(`read:${input.key}`)
      const source = sourceEntries.get(input.key)
      if (!source) {
        throw new Error(`Missing source bytes for ${input.key}`)
      }
      return source
    },
  }
}

function createFinalStorage(calls: string[]): NfeImportFinalStoragePort {
  return {
    async storeImportedDocument(input) {
      calls.push(`store-document:${input.accessKey}:${input.companyId}`)
      return {
        bucket: 'transportada-private',
        key: `tenants/${input.companyId}/nfe-documents/${input.accessKey}/original.xml`,
        objectId: `object-${input.accessKey}`,
        sha256: input.sourceSha256,
        sizeBytes: input.sourceBytes.length,
      }
    },
    async storeImportedEvent(input) {
      calls.push(`store-event:${input.accessKey}:${input.sequence}:${input.type}`)
      return {
        bucket: 'transportada-private',
        key: `tenants/${input.companyId}/nfe-events/${input.accessKey}/${input.type}-${input.sequence}.xml`,
        objectId: `object-${input.accessKey}-${input.sequence}`,
        sha256: input.sourceSha256,
        sizeBytes: input.sourceBytes.length,
      }
    },
  }
}

function createPendingItem(id: string, sourceName: string, sourceKey: string) {
  return {
    attempt: 1,
    id,
    importId: IMPORT_ID,
    ordinal: Number(id.replace('item-', '')),
    sourceContentType: 'application/xml' as const,
    sourceEntry: sourceName,
    sourceKey,
    sourceName,
    sourceSha256: `sha-${sourceName}`,
  }
}

function createImportedXmlVariant(key: string): ImportedNfeXml {
  if (key.includes('event')) {
    const accessKey = key.includes('foreign-event')
      ? '35190730290856000160550010000000011000000012'
      : '35190712345678000190550010000000011000000012'
    return {
      chaveNfe: accessKey,
      dataEvento: '2026-07-22T22:00:00.000Z',
      descricaoEvento: 'Carta de Correcao',
      event: {
        accessKey,
        occurredAt: '2026-07-22T22:00:00.000Z',
        sequence: '1',
        type: '110110',
      },
      kind: 'nfe-event',
      nsu: '',
      schema: 'xml-import',
      tipoEvento: '110110',
      xmlComprimido: '',
      xmlDecoded: key,
    }
  }

  const accessKey = key.includes('duplicate')
    ? '35190730290856000160550010000000011000000013'
    : key.includes('unrelated')
      ? '35190730290856000160550010000000011000000014'
      : key.includes('unsigned')
        ? '35190730290856000160550010000000011000000011'
        : '35190730290856000160550010000000011000000010'
  const relatedCnpjs = key.includes('unrelated') ? ['00987654000199'] : [COMPANY_CNPJ]
  const baseDocument = {
    accessKey,
    additionalInformation: 'Contrato sintético',
    issuedAt: '2026-07-22T22:00:00.000Z',
    issuer: { name: 'Emitente', taxId: '30290856000160' },
    model: '55' as const,
    number: '1',
    operationNature: 'Prestacao',
    operationType: '0',
    products: [],
    recipient: { name: 'Destinatario', taxId: '12345678000190' },
    relatedCnpjs,
    series: '1',
    totals: {
      invoice: '10.0000',
      products: '10.0000',
    },
    volumes: [],
  }

  if (key.includes('unsigned')) {
    return {
      chaveNfe: accessKey,
      document: {
        ...baseDocument,
        status: 'unsigned',
      },
      emitenteCnpj: '30290856000160',
      kind: 'unsigned-nfe',
      mod: '55',
      nsu: '',
      schema: 'xml-import',
      valorTotal: 10,
      xmlComprimido: '',
      xmlDecoded: key,
    } satisfies ImportedNfeXml
  }

  return {
    chaveNfe: accessKey,
    document: {
      ...baseDocument,
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      status: 'authorized',
    },
    emitenteCnpj: '30290856000160',
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '',
    schema: 'xml-import',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
    xmlDecoded: key,
  } satisfies ImportedNfeXml
}

function encodeXml(label: string): Uint8Array {
  return new TextEncoder().encode(`<xml>${label}</xml>`)
}
