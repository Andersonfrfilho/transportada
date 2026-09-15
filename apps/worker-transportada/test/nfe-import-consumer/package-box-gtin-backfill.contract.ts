/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import {
  createNfePackageBoxGtinBackfill,
  type NfePackageBoxGtinBackfillRepository,
  type PendingCartonBox,
} from '../../src/nfe-imports/application/nfe-package-box-gtin-backfill.service.js'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const EMITTER = '05868574001090'
const GTIN_13 = '7894900011517'

type Product = {
  code: string
  commercialUnit: string
  gtin?: string
  taxableUnitGtin?: string
}

function buildImported(products: readonly Product[]): ImportedNfeXml {
  return {
    document: {
      issuer: { taxId: EMITTER },
      products: products.map((product) => ({ ...product, description: 'ENERG' })),
      volumes: [],
    },
    kind: 'authorized-nfe' as const,
  } as unknown as ImportedNfeXml
}

function buildHarness(options: {
  readonly companies?: readonly string[]
  readonly documentsPerCompany?: number
  readonly importXml?: () => Promise<ImportedNfeXml>
  readonly pending?: readonly PendingCartonBox[]
  readonly readXml?: () => Promise<string>
}) {
  const calls: { companyId: string; operation: string }[] = []
  const filled: { boxIds: readonly string[]; cartonGtin: string; companyId: string }[] = []
  const served = new Set<string>()
  const pending = options.pending ?? [
    { commercialUnit: 'CX24', emitterTaxId: EMITTER, id: 'box-1', productCode: '18245' },
  ]
  const repository: NfePackageBoxGtinBackfillRepository = {
    async fillCartonGtin(input) {
      calls.push({ companyId: input.companyId, operation: 'fill' })
      filled.push(input)
      return input.boxIds.length
    },
    async findPendingBoxes(input) {
      calls.push({ companyId: input.companyId, operation: 'find' })
      return pending.filter((box) => !filled.some((entry) => entry.boxIds.includes(box.id)))
    },
    async listCompaniesWithPendingBoxes() {
      return options.companies ?? [COMPANY_A]
    },
    async listPendingDocuments(input) {
      calls.push({ companyId: input.companyId, operation: 'list' })
      if (served.has(input.companyId)) return []
      served.add(input.companyId)
      return Array.from({ length: options.documentsPerCompany ?? 1 }, (_, index) => ({
        bucket: 'fiscal',
        documentId: `${input.companyId}-doc-${index}`,
        objectKey: 'a.xml',
      }))
    },
  }
  return {
    calls,
    dependencies: {
      importer: {
        importXml:
          options.importXml ??
          (async () => buildImported([{ code: '18245', commercialUnit: 'CX24', gtin: GTIN_13 }])),
      },
      repository,
      storage: { readXml: options.readXml ?? (async () => '<nfe/>') },
    },
    filled,
  }
}

describe('o GTIN das caixas já cadastradas, lido do XML guardado', () => {
  test('--confirm grava o GTIN válido na caixa pendente daquele produto', async () => {
    const { dependencies, filled } = buildHarness({})

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(filled).toEqual([{ boxIds: ['box-1'], cartonGtin: GTIN_13, companyId: COMPANY_A }])
    expect(result).toMatchObject({
      boxesFilled: 1,
      boxesInvalidGtin: 0,
      boxesWithoutGtin: 0,
      companies: 1,
      documentsRead: 1,
      documentsXmlMissing: 0,
      documentsXmlUnreadable: 0,
      dryRun: false,
    })
  })

  test('--dry-run conta sem gravar', async () => {
    const { dependencies, filled } = buildHarness({})

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: true })

    expect(filled).toEqual([])
    expect(result).toMatchObject({ boxesFilled: 1, dryRun: true })
  })

  /** Sem gravar, a mesma caixa volta pendente na nota seguinte — e só pode ser contada uma vez. */
  test('--dry-run conta a caixa uma vez só, ainda que duas notas a apresentem', async () => {
    const { dependencies } = buildHarness({ documentsPerCompany: 2 })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: true })

    expect(result).toMatchObject({ boxesFilled: 1, documentsRead: 2 })
  })

  test('produto sem GTIN no XML conta como sem GTIN', async () => {
    const { dependencies, filled } = buildHarness({
      importXml: async () => buildImported([{ code: '18245', commercialUnit: 'CX24' }]),
    })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(filled).toEqual([])
    expect(result).toMatchObject({ boxesFilled: 0, boxesInvalidGtin: 0, boxesWithoutGtin: 1 })
  })

  test('GTIN com dígito errado conta como inválido e não grava', async () => {
    const { dependencies, filled } = buildHarness({
      importXml: async () =>
        buildImported([{ code: '18245', commercialUnit: 'CX24', gtin: '7894900011518' }]),
    })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(filled).toEqual([])
    expect(result).toMatchObject({ boxesFilled: 0, boxesInvalidGtin: 1, boxesWithoutGtin: 0 })
  })

  test('objeto ausente no storage conta como XML ausente, e o lote continua', async () => {
    const { dependencies } = buildHarness({
      documentsPerCompany: 2,
      readXml: async () => {
        throw new Error('object_not_found')
      },
    })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(result).toMatchObject({ documentsRead: 0, documentsXmlMissing: 2 })
  })

  test('XML que o pacote não lê conta como ilegível', async () => {
    const { dependencies } = buildHarness({
      importXml: async () => {
        throw new Error('invalid_xml')
      },
    })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(result).toMatchObject({ documentsRead: 0, documentsXmlUnreadable: 1 })
  })

  test('percorre empresa por empresa, e cada chamada leva a própria empresa', async () => {
    const { calls, dependencies, filled } = buildHarness({ companies: [COMPANY_A, COMPANY_B] })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({ dryRun: false })

    expect(result.companies).toBe(2)
    expect(filled.map((entry) => entry.companyId)).toEqual([COMPANY_A])
    expect(new Set(calls.map((call) => call.companyId))).toEqual(new Set([COMPANY_A, COMPANY_B]))
  })

  test('uma empresa só, quando pedida', async () => {
    const { calls, dependencies } = buildHarness({ companies: [COMPANY_A, COMPANY_B] })

    const result = await createNfePackageBoxGtinBackfill(dependencies).execute({
      companyIds: [COMPANY_B],
      dryRun: true,
    })

    expect(result.companies).toBe(1)
    expect(new Set(calls.map((call) => call.companyId))).toEqual(new Set([COMPANY_B]))
  })
})
