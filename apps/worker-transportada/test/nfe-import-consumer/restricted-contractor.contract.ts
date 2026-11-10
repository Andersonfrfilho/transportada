/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 313: o e-mail de um domínio amarrado a um contratante só importa nota que ele emitiu.
 */
import { describe, expect, it } from 'bun:test'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import {
  type NfeImportConsumerRepositoryPort,
  createNfeImportConsumerFixture,
} from './nfe-import-consumer.fixture.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const COMPANY_CNPJ = '12345678000190'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'
const ISSUER_CNPJ = '30290856000160'
const ACCESS_KEY = `3519073029085600016055001000000001100000001${'0'}`.slice(0, 44)

async function run(
  restrictedContractorTaxId: string | undefined,
  options: { contractorTaxIds?: readonly string[]; relatedCnpjs?: readonly string[] } = {},
) {
  const calls: string[] = []
  const repository: NfeImportConsumerRepositoryPort = {
    async completeItem(input) {
      calls.push(`complete:${input.status}:${input.error?.code ?? ''}`)
    },
    async finalizeImport(input) {
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
            id: 'item-1',
            importId: IMPORT_ID,
            ordinal: 1,
            sourceContentType: 'application/xml' as const,
            sourceEntry: 'a.xml',
            sourceKey: 'staging/a.xml',
            sourceName: 'a.xml',
            sourceSha256: 'sha-a',
          },
        ],
        ...(options.contractorTaxIds === undefined
          ? {}
          : { contractorTaxIds: options.contractorTaxIds }),
        ...(restrictedContractorTaxId === undefined ? {} : { restrictedContractorTaxId }),
      }
    },
  }
  const consumer = await createNfeImportConsumerFixture({
    archiveExpander: {
      async expand(input) {
        return [
          { entryName: input.sourceEntry, sourceBytes: input.sourceBytes, sourceSha256: 'sha-a' },
        ]
      },
    },
    finalStorage: {
      async storeImportedDocument(input) {
        calls.push('store-document')
        return { bucket: 'b', key: 'k', objectId: 'o', sha256: input.sourceSha256, sizeBytes: 1 }
      },
      async storeImportedEvent() {
        throw new Error('unexpected event')
      },
    },
    repository,
    sourceStorage: {
      async readSource() {
        return new TextEncoder().encode('<xml>a</xml>')
      },
    },
    xmlImporter: {
      async importXml() {
        return {
          chaveNfe: ACCESS_KEY,
          document: {
            accessKey: ACCESS_KEY,
            additionalInformation: '',
            issuedAt: '2026-07-22T22:00:00.000Z',
            issuer: { name: 'Emitente', taxId: ISSUER_CNPJ },
            model: '55' as const,
            number: '1',
            operationNature: 'Venda',
            operationType: '0',
            products: [],
            protocol: {
              authorizedAt: '2026-07-22T22:00:00.000Z',
              number: '135260000000001',
              reason: 'Autorizado',
              statusCode: '100',
            },
            recipient: { name: 'Destinatario', taxId: COMPANY_CNPJ },
            relatedCnpjs: options.relatedCnpjs ?? [COMPANY_CNPJ],
            series: '1',
            status: 'authorized',
            totals: { invoice: '10.0000', products: '10.0000' },
            volumes: [],
          },
          emitenteCnpj: ISSUER_CNPJ,
          kind: 'authorized-nfe',
          mod: '55',
          nsu: '',
          schema: 'xml-import',
          situacao: '1',
          valorTotal: 10,
          xmlComprimido: '',
          xmlDecoded: '<xml>a</xml>',
        } satisfies ImportedNfeXml
      },
    },
  })
  const summary = await consumer.execute({
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
  })
  return { calls, summary }
}

describe('NF-e import restricted to the contractor linked to the sender domain', () => {
  it('imports the note when the issuer is the linked contractor (mask in the tax id does not matter)', async () => {
    const { calls, summary } = await run('30.290.856/0001-60')
    expect(summary.importedCount).toBe(1)
    expect(calls).toContain('store-document')
  })

  it('rejects the note issued by anyone else and never stores it', async () => {
    const { calls, summary } = await run('05868574001090')
    expect(summary.rejectedCount).toBe(1)
    expect(summary.importedCount).toBe(0)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_ISSUER_NOT_CONTRACTOR')
    expect(calls).not.toContain('store-document')
  })

  it('closes the door when the linked contractor can no longer be found', async () => {
    const { calls, summary } = await run('')
    expect(summary.rejectedCount).toBe(1)
    expect(calls).not.toContain('store-document')
  })

  it('imports without restriction when the sender is not tied to a contractor', async () => {
    const { summary } = await run(undefined)
    expect(summary.importedCount).toBe(1)
  })

  it('accepts a note that does not name the company when the issuer is an active contractor (SEFAZ does not deliver it)', async () => {
    const { calls, summary } = await run(undefined, {
      contractorTaxIds: ['30.290.856/0001-60'],
      relatedCnpjs: ['22844546000161'],
    })
    expect(summary.importedCount).toBe(1)
    expect(calls).toContain('store-document')
  })

  it('still refuses a note that does not name the company when the issuer is not a contractor', async () => {
    const { calls, summary } = await run(undefined, {
      contractorTaxIds: ['05868574001090'],
      relatedCnpjs: ['22844546000161'],
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_UNRELATED_CNPJ')
    expect(calls).not.toContain('store-document')
  })

  it('keeps holding the note to the linked contractor even when the issuer is another contractor', async () => {
    const { calls, summary } = await run('05868574001090', {
      contractorTaxIds: ['30290856000160', '05868574001090'],
      relatedCnpjs: ['22844546000161'],
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_ISSUER_NOT_CONTRACTOR')
  })
})
