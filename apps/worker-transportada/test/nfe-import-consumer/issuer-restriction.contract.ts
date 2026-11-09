/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import {
  type NfeImportItemProcessingStatus,
  type NfeImportSafeError,
  createNfeImportConsumerFixture,
} from './nfe-import-consumer.fixture.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const COMPANY_CNPJ = '12345678000190'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'
const CONTRACTOR_ROOT = '05868574'
const CONTRACTOR_HEADQUARTERS = '05868574000190'
const CONTRACTOR_BRANCH = '05868574001090'
const OTHER_ISSUER = '30290856000160'

type Outcome = {
  readonly error: NfeImportSafeError | undefined
  readonly status: NfeImportItemProcessingStatus
  readonly stored: boolean
}

async function runOne(input: {
  readonly hasExistingDocument?: boolean
  readonly issuerTaxIdRoot: string | null
  readonly xml: ImportedNfeXml
}): Promise<Outcome> {
  let outcome: Outcome = { error: undefined, status: 'failed', stored: false }
  let stored = false
  const consumer = await createNfeImportConsumerFixture({
    archiveExpander: {
      async expand(request) {
        return [
          { entryName: request.sourceEntry, sourceBytes: request.sourceBytes, sourceSha256: 'sha' },
        ]
      },
    },
    finalStorage: {
      async storeImportedDocument() {
        stored = true
        return { bucket: 'b', key: 'k', objectId: 'o', sha256: 'sha', sizeBytes: 1 }
      },
      async storeImportedEvent() {
        stored = true
        return { bucket: 'b', key: 'k', objectId: 'o', sha256: 'sha', sizeBytes: 1 }
      },
    },
    repository: {
      async completeItem(completion) {
        outcome = { error: completion.error, status: completion.status, stored }
      },
      async finalizeImport(request) {
        return request.summary
      },
      async findExistingDocument() {
        return input.hasExistingDocument === true ? { documentId: 'document-1' } : null
      },
      async getPendingImport() {
        return {
          companyCnpj: COMPANY_CNPJ,
          companyId: COMPANY_ID,
          id: IMPORT_ID,
          issuerTaxIdRoot: input.issuerTaxIdRoot,
          items: [
            {
              attempt: 1,
              id: 'item-1',
              importId: IMPORT_ID,
              ordinal: 1,
              sourceContentType: 'application/xml' as const,
              sourceEntry: '/',
              sourceKey: 'staging/nota.xml',
              sourceName: 'nota.xml',
              sourceSha256: 'sha',
            },
          ],
        }
      },
    },
    sourceStorage: {
      async readSource() {
        return new TextEncoder().encode('<xml/>')
      },
    },
    xmlImporter: {
      async importXml() {
        return input.xml
      },
    },
  })
  await consumer.execute({
    envelope: {
      actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
      companyId: COMPANY_ID,
      correlationId: 'issuer-restriction',
      eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
      occurredAt: '2026-11-09T12:00:00.000Z',
      payload: { importId: IMPORT_ID },
      type: 'transportada.nfe.import.requested',
      version: 1,
    },
  })
  return outcome
}

function buildInvoice(issuerTaxId: string): ImportedNfeXml {
  const accessKey = `3519071234567800019055001000000001100000001${issuerTaxId.slice(-1)}`
  return {
    chaveNfe: accessKey,
    document: {
      accessKey,
      issuedAt: '2026-11-09T12:00:00.000Z',
      issuer: { name: 'Emitente', taxId: issuerTaxId },
      model: '55',
      number: '1',
      operationNature: 'Venda',
      operationType: '1',
      products: [],
      protocol: {
        authorizedAt: '2026-11-09T12:00:00.000Z',
        number: '1',
        reason: 'Autorizado',
        statusCode: '100',
      },
      recipient: { name: 'Destinatario', taxId: COMPANY_CNPJ },
      relatedCnpjs: [issuerTaxId, COMPANY_CNPJ],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: issuerTaxId,
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '',
    schema: 'xml-import',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
    xmlDecoded: '<xml/>',
  } satisfies ImportedNfeXml
}

function buildEvent(issuerTaxId: string): ImportedNfeXml {
  const accessKey = `3519${'07'}${issuerTaxId}55001000000001100000001${'2'}`
  return {
    chaveNfe: accessKey,
    dataEvento: '2026-11-09T12:00:00.000Z',
    descricaoEvento: 'Carta de Correcao',
    event: { accessKey, occurredAt: '2026-11-09T12:00:00.000Z', sequence: '1', type: '110110' },
    kind: 'nfe-event',
    nsu: '',
    schema: 'xml-import',
    tipoEvento: '110110',
    xmlComprimido: '',
    xmlDecoded: '<xml/>',
  } satisfies ImportedNfeXml
}

describe('NF-e import consumer: issuer restriction by sender domain (spec 314)', () => {
  it('rejects an invoice whose issuer is not the contractor linked to the domain', async () => {
    const outcome = await runOne({
      issuerTaxIdRoot: CONTRACTOR_ROOT,
      xml: buildInvoice(OTHER_ISSUER),
    })
    expect(outcome.status).toBe('rejected')
    expect(outcome.error?.code).toBe('NFE_IMPORT_ISSUER_MISMATCH')
    expect(outcome.stored).toBe(false)
  })

  it('accepts the contractor headquarters and any of its branches by the 8-digit root', async () => {
    for (const issuer of [CONTRACTOR_HEADQUARTERS, CONTRACTOR_BRANCH]) {
      const outcome = await runOne({ issuerTaxIdRoot: CONTRACTOR_ROOT, xml: buildInvoice(issuer) })
      expect(outcome.status).toBe('imported')
      expect(outcome.stored).toBe(true)
    }
  })

  it('accepts any issuer when the import carries no restriction', async () => {
    const outcome = await runOne({ issuerTaxIdRoot: null, xml: buildInvoice(OTHER_ISSUER) })
    expect(outcome.status).toBe('imported')
  })

  it('judges an event on a known document by the issuer encoded in its access key', async () => {
    const wrong = await runOne({
      hasExistingDocument: true,
      issuerTaxIdRoot: CONTRACTOR_ROOT,
      xml: buildEvent(OTHER_ISSUER),
    })
    expect(wrong.status).toBe('rejected')
    expect(wrong.error?.code).toBe('NFE_IMPORT_ISSUER_MISMATCH')
    const right = await runOne({
      hasExistingDocument: true,
      issuerTaxIdRoot: CONTRACTOR_ROOT,
      xml: buildEvent(CONTRACTOR_BRANCH),
    })
    expect(right.status).toBe('imported')
  })
})
