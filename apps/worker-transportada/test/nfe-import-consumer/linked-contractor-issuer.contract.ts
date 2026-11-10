/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315: a nota sem relação com a empresa entra quando o remetente está ligado a um contratante ativo e a nota foi
 * emitida por uma empresa da mesma raiz de CNPJ dele.
 */
import { describe, expect, it } from 'bun:test'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { isIssuedByLinkedContractor } from '../../src/nfe-imports/domain/linked-contractor-issuer.policy.js'
import {
  type NfeImportConsumerRepositoryPort,
  createNfeImportConsumerFixture,
} from './nfe-import-consumer.fixture.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const COMPANY_CNPJ = '12345678000190'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'
const CONTRACTOR_CNPJ = '26344834000108'
const BRANCH_CNPJ = '26344834000299'
const OTHER_CNPJ = '30290856000160'
const THIRD_PARTY_CNPJ = '22844546000161'

function buildAccessKey(issuerCnpj: string): string {
  return `351907${issuerCnpj}550010000000011000000010`
}

type RunOptions = {
  readonly isContractorActive?: boolean
  readonly issuerCnpj: string
  readonly kind?: 'authorized-nfe' | 'nfe-event'
  readonly restrictedContractorTaxId?: string
}

function buildImportedXml(options: RunOptions): ImportedNfeXml {
  const accessKey = buildAccessKey(options.issuerCnpj)
  if (options.kind === 'nfe-event') {
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
      xmlDecoded: '<xml>e</xml>',
    }
  }
  return {
    chaveNfe: accessKey,
    document: {
      accessKey,
      additionalInformation: '',
      issuedAt: '2026-07-22T22:00:00.000Z',
      issuer: { name: 'Emitente', taxId: options.issuerCnpj },
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
      recipient: { name: 'Destinatario', taxId: '00987654000199' },
      relatedCnpjs: [options.issuerCnpj, THIRD_PARTY_CNPJ, '00987654000199'],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: options.issuerCnpj,
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '',
    schema: 'xml-import',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
    xmlDecoded: '<xml>a</xml>',
  } satisfies ImportedNfeXml
}

async function run(options: RunOptions) {
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
        ...(options.restrictedContractorTaxId === undefined
          ? {}
          : {
              isRestrictedContractorActive: options.isContractorActive ?? true,
              restrictedContractorTaxId: options.restrictedContractorTaxId,
            }),
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
      async storeImportedEvent(input) {
        calls.push('store-event')
        return { bucket: 'b', key: 'k', objectId: 'o', sha256: input.sourceSha256, sizeBytes: 1 }
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
        return buildImportedXml(options)
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

describe('isIssuedByLinkedContractor', () => {
  const accessKey = buildAccessKey(BRANCH_CNPJ)

  it('accepts an issuer that shares the 8-digit root with the active contractor', () => {
    expect(
      isIssuedByLinkedContractor({
        accessKey,
        contractorTaxId: '26.344.834/0001-08',
        isContractorActive: true,
      }),
    ).toBe(true)
  })

  it('refuses another root, an inactive contractor and a missing contractor', () => {
    expect(
      isIssuedByLinkedContractor({
        accessKey: buildAccessKey(OTHER_CNPJ),
        contractorTaxId: CONTRACTOR_CNPJ,
        isContractorActive: true,
      }),
    ).toBe(false)
    expect(
      isIssuedByLinkedContractor({
        accessKey,
        contractorTaxId: CONTRACTOR_CNPJ,
        isContractorActive: false,
      }),
    ).toBe(false)
    expect(
      isIssuedByLinkedContractor({
        accessKey,
        contractorTaxId: undefined,
        isContractorActive: undefined,
      }),
    ).toBe(false)
    expect(
      isIssuedByLinkedContractor({ accessKey, contractorTaxId: '', isContractorActive: true }),
    ).toBe(false)
  })

  it('refuses a contractor registered with a CPF, which has no root to compare', () => {
    expect(
      isIssuedByLinkedContractor({
        accessKey: buildAccessKey('26344834000108'),
        contractorTaxId: '26344834000',
        isContractorActive: true,
      }),
    ).toBe(false)
  })
})

describe('NF-e unrelated to the company, sent by a sender linked to a contractor', () => {
  it('imports the note issued by the linked contractor even though it names another carrier', async () => {
    const { calls, summary } = await run({
      issuerCnpj: CONTRACTOR_CNPJ,
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(summary.importedCount).toBe(1)
    expect(calls).toContain('store-document')
  })

  it('rejects the same note when the sender is not linked to any contractor', async () => {
    const { calls, summary } = await run({ issuerCnpj: CONTRACTOR_CNPJ })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_UNRELATED_CNPJ')
    expect(calls).not.toContain('store-document')
  })

  it('rejects a note issued by a company of another root', async () => {
    const { calls, summary } = await run({
      issuerCnpj: OTHER_CNPJ,
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_UNRELATED_CNPJ')
    expect(calls).not.toContain('store-document')
  })

  it('rejects the note when the linked contractor is inactive', async () => {
    const { calls, summary } = await run({
      isContractorActive: false,
      issuerCnpj: CONTRACTOR_CNPJ,
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_UNRELATED_CNPJ')
  })

  it('rejects when the linked contractor cannot be resolved', async () => {
    const { calls, summary } = await run({
      isContractorActive: false,
      issuerCnpj: CONTRACTOR_CNPJ,
      restrictedContractorTaxId: '',
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).not.toContain('store-document')
  })

  it('keeps the exact-issuer restriction after the bypass: a branch of the root is still refused', async () => {
    const { calls, summary } = await run({
      issuerCnpj: BRANCH_CNPJ,
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(summary.rejectedCount).toBe(1)
    expect(calls).toContain('complete:rejected:NFE_IMPORT_ISSUER_NOT_CONTRACTOR')
  })

  it('treats an event of a note issued by the linked contractor the same way', async () => {
    const accepted = await run({
      issuerCnpj: CONTRACTOR_CNPJ,
      kind: 'nfe-event',
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(accepted.calls).toContain('store-event')
    const refused = await run({ issuerCnpj: CONTRACTOR_CNPJ, kind: 'nfe-event' })
    expect(refused.calls).toContain('complete:rejected:NFE_IMPORT_UNRELATED_CNPJ')
    const otherRoot = await run({
      issuerCnpj: OTHER_CNPJ,
      kind: 'nfe-event',
      restrictedContractorTaxId: CONTRACTOR_CNPJ,
    })
    expect(otherRoot.calls).not.toContain('store-event')
  })
})
