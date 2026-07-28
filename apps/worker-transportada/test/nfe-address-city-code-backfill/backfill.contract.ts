/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml, NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import { createNfeAddressCityCodeBackfill } from '../../src/nfe-imports/application/nfe-address-city-code-backfill.service.js'
import type {
  NfeAddressCityCodeBackfillRepository,
  NfeAddressCityCodePendingDocument,
} from '../../src/nfe-imports/application/nfe-address-city-code-backfill.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000101'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000909'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000230'
const EMITTER_ADDRESS_ID = '00000000-0000-4000-8000-000000000301'
const RECIPIENT_ADDRESS_ID = '00000000-0000-4000-8000-000000000302'
const CARRIER_ADDRESS_ID = '00000000-0000-4000-8000-000000000303'

const DOCUMENT: NfeXmlDocument = {
  accessKey: '35260761156864000191550010000000022000000022',
  carrier: { name: 'Transportadora Sem Endereco LTDA', taxId: '12345678000199' },
  issuedAt: '2026-07-22T14:00:00.000Z',
  issuer: {
    address: { city: 'Taubaté', cityCode: '3554102', state: 'SP', street: 'Rua das Cargas' },
    name: 'Emitente Teste LTDA',
    taxId: '61156864000191',
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

describe('nfe address city code backfill contract', () => {
  test('fills the missing city code of every address from the preserved xml', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfeAddressCityCodeBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([
      {
        cityCodeByAddressId: {
          [EMITTER_ADDRESS_ID]: '3554102',
          [RECIPIENT_ADDRESS_ID]: '3523701',
        },
        companyId: COMPANY_ID,
      },
    ])
    expect(result.addressesUpdated).toBe(2)
    expect(result.documentsScanned).toBe(1)
  })

  test('leaves an address alone when the xml party carries no city code', async () => {
    const repository = createRepository([
      pendingDocument({
        addresses: [{ addressId: CARRIER_ADDRESS_ID, role: 'carrier' }],
      }),
    ])
    const backfill = createNfeAddressCityCodeBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ companyId: COMPANY_ID })

    expect(repository.applied).toEqual([])
    expect(result.addressesUpdated).toBe(0)
    expect(result.documentsSkipped).toBe(1)
  })

  test('skips a preserved xml that is an event instead of a document', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfeAddressCityCodeBackfill({
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
      documentId: '00000000-0000-4000-8000-000000000231',
      objectKey: 'nfe/perdida.xml',
    })
    const repository = createRepository([failing, pendingDocument()])
    const backfill = createNfeAddressCityCodeBackfill({
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
    expect(result.addressesUpdated).toBe(2)
    expect(repository.applied).toHaveLength(1)
  })

  test('walks every page until the repository reports no pending document', async () => {
    const repository = createRepository(
      [pendingDocument()],
      [pendingDocument({ documentId: '00000000-0000-4000-8000-000000000232' })],
    )
    const backfill = createNfeAddressCityCodeBackfill({
      importer: createImporter(),
      repository,
      storage: createStorage(),
    })

    const result = await backfill.execute({ batchSize: 1, companyId: COMPANY_ID })

    expect(repository.listed).toEqual([
      { companyId: COMPANY_ID, cursor: undefined, limit: 1 },
      { companyId: COMPANY_ID, cursor: DOCUMENT_ID, limit: 1 },
      { companyId: COMPANY_ID, cursor: '00000000-0000-4000-8000-000000000232', limit: 1 },
    ])
    expect(result.documentsScanned).toBe(2)
  })

  test('never crosses the tenant boundary of the requested company', async () => {
    const repository = createRepository([pendingDocument()])
    const backfill = createNfeAddressCityCodeBackfill({
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
    const backfill = createNfeAddressCityCodeBackfill({
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
    })
  })
})

function pendingDocument(
  overrides: Partial<NfeAddressCityCodePendingDocument> = {},
): NfeAddressCityCodePendingDocument {
  return {
    addresses: [
      { addressId: EMITTER_ADDRESS_ID, role: 'emitter' },
      { addressId: RECIPIENT_ADDRESS_ID, role: 'recipient' },
    ],
    bucket: 'transportada-private',
    documentId: DOCUMENT_ID,
    objectKey: `nfe/${DOCUMENT.accessKey}.xml`,
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
  readonly cityCodeByAddressId: Readonly<Record<string, string>>
  readonly companyId: string
}

function createRepository(
  ...pages: readonly (readonly NfeAddressCityCodePendingDocument[])[]
): NfeAddressCityCodeBackfillRepository & {
  readonly applied: readonly ApplyCall[]
  readonly listed: readonly ListCall[]
} {
  const applied: ApplyCall[] = []
  const listed: ListCall[] = []
  const remaining = [...pages]

  return {
    applied,
    async applyCityCodes(input) {
      applied.push({
        cityCodeByAddressId: input.cityCodeByAddressId,
        companyId: input.companyId,
      })
      return Object.keys(input.cityCodeByAddressId).length
    },
    listed,
    async listDocumentsMissingCityCode(input) {
      listed.push({ companyId: input.companyId, cursor: input.cursor, limit: input.limit })
      return remaining.shift() ?? []
    },
  }
}
