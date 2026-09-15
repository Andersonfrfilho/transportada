/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml, NfeXmlProduct } from '@adatechnology/fiscal-provider'

import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { resolveCartonGtin } from '../domain/carton-gtin.policy.js'
import type {
  NfePackageBoxBackfillImporter,
  NfePackageBoxBackfillStorage,
  NfePackageBoxPendingDocument,
} from './nfe-package-box-backfill.service.js'

const DEFAULT_BATCH_SIZE = 100

export type PendingCartonBox = {
  readonly commercialUnit: string
  readonly emitterTaxId: string
  readonly id: string
  readonly productCode: string
}

export type NfePackageBoxGtinBackfillRepository = {
  fillCartonGtin(input: {
    readonly boxIds: readonly string[]
    readonly cartonGtin: string
    readonly companyId: string
  }): Promise<number>
  findPendingBoxes(input: {
    readonly companyId: string
    readonly emitterTaxId: string
    readonly keys: readonly { readonly commercialUnit: string; readonly productCode: string }[]
  }): Promise<readonly PendingCartonBox[]>
  listCompaniesWithPendingBoxes(): Promise<readonly string[]>
  listPendingDocuments(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfePackageBoxPendingDocument[]>
}

export type NfePackageBoxGtinBackfillResult = {
  readonly boxesFilled: number
  readonly boxesInvalidGtin: number
  readonly boxesWithoutGtin: number
  readonly companies: number
  readonly documentsRead: number
  readonly documentsXmlMissing: number
  readonly documentsXmlUnreadable: number
  readonly dryRun: boolean
}

type ProductGtin = { readonly cartonGtin: string } | { readonly reason: 'invalid' | 'missing' }

type CompanyTally = {
  documentsRead: number
  documentsXmlMissing: number
  documentsXmlUnreadable: number
  readonly filled: Set<string>
  readonly invalid: Set<string>
  readonly missing: Set<string>
}

type Dependencies = {
  readonly importer: NfePackageBoxBackfillImporter
  readonly logger?: WorkerLogger
  readonly repository: NfePackageBoxGtinBackfillRepository
  readonly storage: NfePackageBoxBackfillStorage
}

/**
 * O GTIN das caixas já cadastradas, relido do XML guardado (fiscal-provider 0.3.2 expõe `cEAN`).
 *
 * ⚠️ A escrita é `carton_gtin is null` no WHERE: reprocessar é grátis e nunca troca um GTIN já
 * gravado. As contagens são por **caixa distinta**: sem gravar (dry-run), a mesma caixa volta
 * pendente na nota seguinte, e contá-la de novo inflaria o relatório.
 */
export function createNfePackageBoxGtinBackfill(dependencies: Dependencies): {
  execute(input: {
    readonly batchSize?: number
    readonly companyIds?: readonly string[]
    readonly dryRun: boolean
  }): Promise<NfePackageBoxGtinBackfillResult>
} {
  return {
    async execute(input): Promise<NfePackageBoxGtinBackfillResult> {
      const companyIds =
        input.companyIds ?? (await dependencies.repository.listCompaniesWithPendingBoxes())
      const totals = {
        boxesFilled: 0,
        boxesInvalidGtin: 0,
        boxesWithoutGtin: 0,
        companies: companyIds.length,
        documentsRead: 0,
        documentsXmlMissing: 0,
        documentsXmlUnreadable: 0,
        dryRun: input.dryRun,
      }
      for (const companyId of companyIds) {
        const tally = await backfillCompany({
          batchSize: input.batchSize ?? DEFAULT_BATCH_SIZE,
          companyId,
          dependencies,
          dryRun: input.dryRun,
        })
        totals.boxesFilled += tally.filled.size
        totals.boxesInvalidGtin += countUnfilled(tally.invalid, tally.filled)
        totals.boxesWithoutGtin += countUnfilled(tally.missing, tally.filled)
        totals.documentsRead += tally.documentsRead
        totals.documentsXmlMissing += tally.documentsXmlMissing
        totals.documentsXmlUnreadable += tally.documentsXmlUnreadable
      }
      return totals
    },
  }
}

async function backfillCompany(input: {
  readonly batchSize: number
  readonly companyId: string
  readonly dependencies: Dependencies
  readonly dryRun: boolean
}): Promise<CompanyTally> {
  const tally: CompanyTally = {
    documentsRead: 0,
    documentsXmlMissing: 0,
    documentsXmlUnreadable: 0,
    filled: new Set(),
    invalid: new Set(),
    missing: new Set(),
  }
  let cursor: string | undefined
  for (;;) {
    const documents = await input.dependencies.repository.listPendingDocuments({
      companyId: input.companyId,
      cursor,
      limit: input.batchSize,
    })
    if (documents.length === 0) return tally

    for (const document of documents) {
      const imported = await readDocument({ dependencies: input.dependencies, document, tally })
      if (imported === undefined) continue
      tally.documentsRead += 1
      if (imported.kind === 'nfe-event') continue
      await fillDocumentBoxes({ ...input, document: imported.document, tally })
    }
    cursor = documents[documents.length - 1]?.documentId
  }
}

/** Objeto ausente e XML ilegível contam separado, e nenhum dos dois para o lote. */
async function readDocument(input: {
  readonly dependencies: Dependencies
  readonly document: NfePackageBoxPendingDocument
  readonly tally: CompanyTally
}): Promise<ImportedNfeXml | undefined> {
  let xml: string
  try {
    xml = await input.dependencies.storage.readXml({
      bucket: input.document.bucket,
      key: input.document.objectKey,
    })
  } catch {
    input.tally.documentsXmlMissing += 1
    logFailure({ ...input, reason: 'xml_missing' })
    return undefined
  }
  try {
    return await input.dependencies.importer.importXml({ xml })
  } catch {
    input.tally.documentsXmlUnreadable += 1
    logFailure({ ...input, reason: 'xml_unreadable' })
    return undefined
  }
}

async function fillDocumentBoxes(input: {
  readonly companyId: string
  readonly dependencies: Dependencies
  readonly document: {
    readonly issuer: { readonly taxId?: string }
    readonly products: readonly NfeXmlProduct[]
  }
  readonly dryRun: boolean
  readonly tally: CompanyTally
}): Promise<void> {
  const emitterTaxId = (input.document.issuer.taxId ?? '').trim()
  const byKey = classifyProducts(input.document.products)
  if (emitterTaxId === '' || byKey.size === 0) return

  const pending = await input.dependencies.repository.findPendingBoxes({
    companyId: input.companyId,
    emitterTaxId,
    keys: [...byKey.values()].map((entry) => entry.key),
  })
  const idsByGtin = new Map<string, string[]>()
  for (const box of pending) {
    if (input.tally.filled.has(box.id)) continue
    const gtin = byKey.get(`${box.productCode}|${box.commercialUnit}`)?.gtin
    if (gtin === undefined) continue
    if ('reason' in gtin) {
      input.tally[gtin.reason].add(box.id)
      continue
    }
    idsByGtin.set(gtin.cartonGtin, [...(idsByGtin.get(gtin.cartonGtin) ?? []), box.id])
  }

  for (const [cartonGtin, boxIds] of idsByGtin) {
    if (!input.dryRun) {
      await input.dependencies.repository.fillCartonGtin({
        boxIds,
        cartonGtin,
        companyId: input.companyId,
      })
    }
    for (const id of boxIds) input.tally.filled.add(id)
  }
}

/** Linhas repetidas do mesmo par: o primeiro GTIN válido vence, como na importação. */
function classifyProducts(products: readonly NfeXmlProduct[]): Map<
  string,
  {
    readonly gtin: ProductGtin
    readonly key: { readonly commercialUnit: string; readonly productCode: string }
  }
> {
  const byKey = new Map<
    string,
    {
      readonly gtin: ProductGtin
      readonly key: { readonly commercialUnit: string; readonly productCode: string }
    }
  >()
  for (const product of products) {
    if (product.code.trim() === '' || product.commercialUnit.trim() === '') continue
    const mapKey = `${product.code}|${product.commercialUnit}`
    const previous = byKey.get(mapKey)
    if (previous !== undefined && 'cartonGtin' in previous.gtin) continue
    byKey.set(mapKey, {
      gtin: classifyGtin(product),
      key: { commercialUnit: product.commercialUnit, productCode: product.code },
    })
  }
  return byKey
}

function classifyGtin(product: NfeXmlProduct): ProductGtin {
  const cartonGtin = resolveCartonGtin(product)
  if (cartonGtin !== null) return { cartonGtin }
  const hasCode = product.gtin !== undefined || product.taxableUnitGtin !== undefined
  return { reason: hasCode ? 'invalid' : 'missing' }
}

function countUnfilled(ids: ReadonlySet<string>, filled: ReadonlySet<string>): number {
  let count = 0
  for (const id of ids) if (!filled.has(id)) count += 1
  return count
}

/** Só o id da nota e a classe da falha: o código, a chave e o XML nunca vão ao log. */
function logFailure(input: {
  readonly dependencies: Dependencies
  readonly document: NfePackageBoxPendingDocument
  readonly reason: 'xml_missing' | 'xml_unreadable'
}): void {
  if (input.dependencies.logger === undefined) return
  safeLogError({
    logger: input.dependencies.logger,
    message: 'nfe_package_box_gtin_backfill_document_failed',
    metadata: { documentId: input.document.documentId, reason: input.reason },
  })
}
