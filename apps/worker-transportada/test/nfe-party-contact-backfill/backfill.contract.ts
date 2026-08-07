/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml, NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import { createNfePartyContactBackfill } from '../../src/nfe-imports/application/nfe-party-contact-backfill.service.js'
import type {
  NfePartyContactBackfillRepository,
  NfePartyContactPendingDocument,
} from '../../src/nfe-imports/application/nfe-party-contact-backfill.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000101'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000909'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000240'
const EMITTER_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000401'
const RECIPIENT_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000402'
const CARRIER_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000403'
const EMITTER_ADDRESS_ID = '00000000-0000-4000-8000-000000000501'
const RECIPIENT_ADDRESS_ID = '00000000-0000-4000-8000-000000000502'

const DOCUMENT: NfeXmlDocument = {
  accessKey: '35260761156864000191550010000000022000000022',
  carrier: { name: 'Transportadora Sem Contato LTDA', taxId: '12345678000199' },
  issuedAt: '2026-07-22T14:00:00.000Z',
  issuer: {
    address: {
      city: 'Taubaté',
      cityCode: '3554102',
      phone: '1233334444',
      state: 'SP',
      street: 'Rua das Cargas',
    },
    name: 'Emitente Teste LTDA',
    taxId: '61156864000191',
    tradeName: 'EMITENTE CARGAS',
  },
  model: '55',
  number: '000012345',
  operationNature: 'Venda de mercadoria',
  operationType: '1',
  products: [],
  recipient: {
    address: { city: 'Itirapuã', cityCode: '3523701', state: 'SP', street: 'Avenida Logística' },
    name: 'Destinatario Teste LTDA',
    taxId: '12345678000188',
  },
  relatedCnpjs: [],
  series: '001',
  status: 'authorized',
  totals: { invoice: '958.48', products: '958.48' },
  volumes: [],
}

// Nota importada antes das colunas existirem sai do CT-e sem xFant e sem fone; o XML original
// preservado é a única origem desses dados.
describe('nfe party contact backfill contract', () => {
  test('fills the trade name and the phone the preserved xml carries', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([
      {
        companyId: COMPANY_ID,
        phoneByAddressId: { [EMITTER_ADDRESS_ID]: '1233334444' },
        tradeNameByParticipantId: { [EMITTER_PARTICIPANT_ID]: 'EMITENTE CARGAS' },
      },
    ])
    expect(result.addressesUpdated).toBe(1)
    expect(result.participantsUpdated).toBe(1)
    expect(result.documentsScanned).toBe(1)
  })

  test('leaves a party alone when the xml carries neither trade name nor phone', async () => {
    const repository = createRepository([
      pendingDocument({
        parties: [
          { addressId: null, participantId: CARRIER_PARTICIPANT_ID, role: 'carrier' },
          {
            addressId: RECIPIENT_ADDRESS_ID,
            participantId: RECIPIENT_PARTICIPANT_ID,
            role: 'recipient',
          },
        ],
      }),
    ])
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([])
    expect(result.addressesUpdated).toBe(0)
    expect(result.participantsUpdated).toBe(0)
    expect(result.documentsSkipped).toBe(1)
  })

  test('skips a preserved xml that is an event instead of a document', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfePartyContactBackfill({
      importer: {
        importXml: async (): Promise<ImportedNfeXml> =>
          ({
            accessKey: DOCUMENT.accessKey,
            event: { accessKey: DOCUMENT.accessKey },
            kind: 'nfe-event',
          }) as unknown as ImportedNfeXml,
      },
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([])
    expect(result.documentsSkipped).toBe(1)
    expect(result.documentsFailed).toBe(0)
  })

  test('keeps going when a single document fails to be read', async () => {
    const failing = pendingDocument({
      documentId: '00000000-0000-4000-8000-000000000241',
      objectKey: 'nfe/perdida.xml',
    })
    const repository = createRepository([failing, pendingDocument()])
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: {
        readXml: async (input: { readonly bucket: string; readonly key: string }) => {
          if (input.key === failing.objectKey) throw new Error('object not found')
          return '<nfeProc/>'
        },
      },
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(result.documentsFailed).toBe(1)
    expect(result.participantsUpdated).toBe(1)
    expect(repository.applied).toHaveLength(1)
  })

  test('walks every page until the repository reports no pending document', async () => {
    const repository = createRepository(
      [pendingDocument()],
      [pendingDocument({ documentId: '00000000-0000-4000-8000-000000000242' })],
    )
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ batchSize: 1, companyId: COMPANY_ID })

    expect(repository.listed).toEqual([
      { companyId: COMPANY_ID, cursor: undefined, limit: 1 },
      { companyId: COMPANY_ID, cursor: DOCUMENT_ID, limit: 1 },
      { companyId: COMPANY_ID, cursor: '00000000-0000-4000-8000-000000000242', limit: 1 },
    ])
    expect(result.documentsScanned).toBe(2)
  })

  test('never crosses the tenant boundary of the requested company', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    await backfill.execute({ companyId: OTHER_COMPANY_ID })

    expect(repository.listed.every((call) => call.companyId === OTHER_COMPANY_ID)).toBe(true)
    expect(repository.applied.every((call) => call.companyId === OTHER_COMPANY_ID)).toBe(true)
  })

  test('is a no-op when nothing is pending', async () => {
    const repository = createRepository()
    const backfill = createNfePartyContactBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([])
    expect(result).toEqual({
      addressesUpdated: 0,
      documentsFailed: 0,
      documentsScanned: 0,
      documentsSkipped: 0,
      participantsUpdated: 0,
    })
  })
})

function pendingDocument(
  overrides: Partial<NfePartyContactPendingDocument> = {},
): NfePartyContactPendingDocument {
  return {
    bucket: 'transportada-private',
    documentId: DOCUMENT_ID,
    objectKey: `nfe/${DOCUMENT.accessKey}.xml`,
    parties: [
      { addressId: EMITTER_ADDRESS_ID, participantId: EMITTER_PARTICIPANT_ID, role: 'emitter' },
      {
        addressId: RECIPIENT_ADDRESS_ID,
        participantId: RECIPIENT_PARTICIPANT_ID,
        role: 'recipient',
      },
    ],
    ...overrides,
  }
}

function createImporter(): { importXml(input: { readonly xml: string }): Promise<ImportedNfeXml> } {
  return {
    importXml: async (): Promise<ImportedNfeXml> =>
      ({
        accessKey: DOCUMENT.accessKey,
        document: DOCUMENT,
        kind: 'authorized-nfe',
      }) as unknown as ImportedNfeXml,
  }
}

function createStorage(): {
  readXml(input: { readonly bucket: string; readonly key: string }): Promise<string>
} {
  return { readXml: async () => '<nfeProc/>' }
}

type ListCall = {
  readonly companyId: string
  readonly cursor: string | undefined
  readonly limit: number
}

type ApplyCall = {
  readonly companyId: string
  readonly phoneByAddressId: Readonly<Record<string, string>>
  readonly tradeNameByParticipantId: Readonly<Record<string, string>>
}

function createRepository(
  ...pages: readonly (readonly NfePartyContactPendingDocument[])[]
): NfePartyContactBackfillRepository & {
  readonly applied: readonly ApplyCall[]
  readonly listed: readonly ListCall[]
} {
  const applied: ApplyCall[] = []
  const listed: ListCall[] = []
  const remaining = [...pages]

  return {
    applied,
    async applyPartyContacts(input) {
      applied.push({
        companyId: input.companyId,
        phoneByAddressId: input.phoneByAddressId,
        tradeNameByParticipantId: input.tradeNameByParticipantId,
      })
      return {
        addressesUpdated: Object.keys(input.phoneByAddressId).length,
        participantsUpdated: Object.keys(input.tradeNameByParticipantId).length,
      }
    },
    listed,
    async listDocumentsMissingPartyContact(input) {
      listed.push({ companyId: input.companyId, cursor: input.cursor, limit: input.limit })
      return remaining.shift() ?? []
    },
  }
}
