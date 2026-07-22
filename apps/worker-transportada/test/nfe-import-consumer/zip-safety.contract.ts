/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  type ExpandedXmlEntry,
  type NfeImportConsumerRepositoryPort,
  createNfeImportConsumerFixture,
} from './nfe-import-consumer.fixture.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const COMPANY_CNPJ = '12345678000190'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'

describe('NF-e import consumer ZIP contract', () => {
  it('treats adversarial ZIP expansion as an item error and continues the remaining batch', async () => {
    const calls: string[] = []
    const consumer = await createNfeImportConsumerFixture({
      archiveExpander: {
        async expand(input) {
          calls.push(`expand:${input.sourceName}`)
          if (input.sourceName === 'adversarial.zip') {
            throw new Error('ZIP_UNSAFE_ENTRY')
          }
          return [
            {
              entryName: input.sourceEntry,
              sourceBytes: input.sourceBytes,
              sourceSha256: 'sha-safe.xml',
            } satisfies ExpandedXmlEntry,
          ]
        },
      },
      finalStorage: {
        async storeImportedDocument(input) {
          calls.push(`store-document:${input.accessKey}`)
          return {
            bucket: 'transportada-private',
            key: `tenants/${input.companyId}/nfe-documents/${input.accessKey}/original.xml`,
            sha256: input.sourceSha256,
          }
        },
        async storeImportedEvent() {
          throw new Error('Event storage is not expected in this contract')
        },
      },
      repository: createRepository(calls),
      sourceStorage: {
        async readSource(input) {
          calls.push(`read:${input.key}`)
          return new TextEncoder().encode(input.key)
        },
      },
      xmlImporter: {
        async importXml(input) {
          calls.push(`import:${input.xml}`)
          return {
            chaveNfe: '35190730290856000160550010000000011000000015',
            document: {
              accessKey: '35190730290856000160550010000000011000000015',
              issuedAt: '2026-07-22T22:10:00.000Z',
              issuer: { name: 'Emitente', taxId: '30290856000160' },
              model: '55',
              number: '15',
              operationNature: 'Prestacao',
              operationType: '0',
              products: [],
              protocol: {
                authorizedAt: '2026-07-22T22:10:00.000Z',
                number: '135260000000015',
                reason: 'Autorizado',
                statusCode: '100',
              },
              relatedCnpjs: [COMPANY_CNPJ],
              series: '1',
              status: 'authorized',
              totals: { invoice: '10.0000', products: '10.0000' },
              volumes: [],
            },
            emitenteCnpj: '30290856000160',
            kind: 'authorized-nfe',
            mod: '55',
            nsu: '',
            schema: 'xml-import',
            situacao: '1',
            valorTotal: 10,
            xmlComprimido: '',
            xmlDecoded: input.xml,
          }
        },
      },
    })

    await expect(
      consumer.execute({
        envelope: {
          actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
          companyId: COMPANY_ID,
          correlationId: 'contract-test-correlation',
          eventId: '7c446555-c67b-4545-a060-16d55278665e',
          occurredAt: '2026-07-22T22:10:00.000Z',
          payload: { importId: IMPORT_ID },
          type: 'transportada.nfe.import.requested',
          version: 1,
        },
      }),
    ).resolves.toEqual({
      duplicatedCount: 0,
      failedCount: 0,
      id: IMPORT_ID,
      importedCount: 1,
      invalidCount: 1,
      processedCount: 2,
      receivedCount: 2,
      rejectedCount: 0,
      status: 'partially_processed',
    })

    expect(calls).toContain('complete:item-zip:invalid:ZIP_UNSAFE_ENTRY')
    expect(calls).toContain('complete:item-xml:imported')
    expect(calls.filter((call) => call.startsWith('import:'))).toHaveLength(1)
    expect(calls).toContain('finalize:partially_processed:1:1')
  })
})

function createRepository(calls: string[]): NfeImportConsumerRepositoryPort {
  return {
    async completeItem(input) {
      calls.push(
        `complete:${input.itemId}:${input.status}${input.error ? `:${input.error.code}` : ''}`,
      )
    },
    async finalizeImport(input) {
      calls.push(
        `finalize:${input.summary.status}:${input.summary.importedCount}:${input.summary.invalidCount}`,
      )
      return input.summary
    },
    async findExistingDocument() {
      return null
    },
    async getPendingImport() {
      return {
        companyCnpj: COMPANY_CNPJ,
        companyId: COMPANY_ID,
        id: IMPORT_ID,
        items: [
          {
            attempt: 1,
            id: 'item-zip',
            importId: IMPORT_ID,
            ordinal: 1,
            sourceContentType: 'application/zip',
            sourceEntry: 'payload.xml',
            sourceKey: 'staging/adversarial.zip',
            sourceName: 'adversarial.zip',
            sourceSha256: 'sha-adversarial',
          },
          {
            attempt: 1,
            id: 'item-xml',
            importId: IMPORT_ID,
            ordinal: 2,
            sourceContentType: 'application/xml',
            sourceEntry: 'safe.xml',
            sourceKey: 'staging/safe.xml',
            sourceName: 'safe.xml',
            sourceSha256: 'sha-safe',
          },
        ],
      }
    },
  }
}
