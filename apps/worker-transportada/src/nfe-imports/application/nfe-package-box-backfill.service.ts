/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  buildPackageBoxRows,
  deriveBoxGrossWeightGrams,
  type PackageBoxRow,
} from '../domain/package-box.policy.js'

const DEFAULT_BATCH_SIZE = 100

export type NfePackageBoxPendingDocument = {
  readonly bucket: string
  readonly documentId: string
  readonly objectKey: string
}

export type NfePackageBoxBackfillRepository = {
  insertPackageBoxes(input: {
    readonly boxes: readonly (PackageBoxRow & { readonly grossWeightGrams?: number })[]
    readonly companyId: string
  }): Promise<number>
  listArchivedDocuments(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfePackageBoxPendingDocument[]>
}

export type NfePackageBoxBackfillStorage = {
  readXml(input: { readonly bucket: string; readonly key: string }): Promise<string>
}

export type NfePackageBoxBackfillImporter = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

export type NfePackageBoxBackfillResult = {
  readonly boxesCreated: number
  readonly documentsFailed: number
  readonly documentsScanned: number
  readonly documentsSkipped: number
}

export type NfePackageBoxBackfill = {
  execute(input: {
    readonly batchSize?: number
    readonly companyId: string
  }): Promise<NfePackageBoxBackfillResult>
}

/**
 * O cadastro de caixa preenchido pelo que já rodou (spec 085, ADR-0062). Mesmo molde do backfill de
 * contatos: relê o XML arquivado, que é a única fonte que ainda tem `cProd` e `uCom` juntos.
 *
 * ⚠️ A escrita é `onConflictDoNothing` no repositório: a linha existente carrega a medição do
 * conferente, e o backfill nunca a reescreve. É por isso que a varredura é de **todas** as notas
 * arquivadas, e não das que "faltam caixa": a caixa é do par `(emitente, cProd, uCom)`, não da
 * nota, e não há filtro barato que diga se uma nota ainda acrescenta linha. Reprocessar é grátis.
 */
export function createNfePackageBoxBackfill(dependencies: {
  readonly importer: NfePackageBoxBackfillImporter
  readonly logger?: WorkerLogger
  readonly repository: NfePackageBoxBackfillRepository
  readonly storage: NfePackageBoxBackfillStorage
}): NfePackageBoxBackfill {
  return {
    async execute(input): Promise<NfePackageBoxBackfillResult> {
      const limit = input.batchSize ?? DEFAULT_BATCH_SIZE
      let boxesCreated = 0
      let documentsFailed = 0
      let documentsScanned = 0
      let documentsSkipped = 0
      let cursor: string | undefined

      for (;;) {
        const pending = await dependencies.repository.listArchivedDocuments({
          companyId: input.companyId,
          cursor,
          limit,
        })
        if (pending.length === 0) break

        for (const document of pending) {
          documentsScanned += 1
          try {
            const boxes = await resolveBoxes({ dependencies, document })
            if (boxes.length === 0) {
              documentsSkipped += 1
              continue
            }
            boxesCreated += await dependencies.repository.insertPackageBoxes({
              boxes,
              companyId: input.companyId,
            })
          } catch (error: unknown) {
            documentsFailed += 1
            logFailure({ document, error, logger: dependencies.logger })
          }
        }

        cursor = pending[pending.length - 1]?.documentId
      }

      return { boxesCreated, documentsFailed, documentsScanned, documentsSkipped }
    },
  }
}

async function resolveBoxes(input: {
  readonly dependencies: {
    readonly importer: NfePackageBoxBackfillImporter
    readonly storage: NfePackageBoxBackfillStorage
  }
  readonly document: NfePackageBoxPendingDocument
}): Promise<readonly (PackageBoxRow & { readonly grossWeightGrams?: number })[]> {
  const xml = await input.dependencies.storage.readXml({
    bucket: input.document.bucket,
    key: input.document.objectKey,
  })
  const imported = await input.dependencies.importer.importXml({ xml })
  if (imported.kind === 'nfe-event') return []

  const rows = buildPackageBoxRows({
    emitterTaxId: imported.document.issuer.taxId,
    products: imported.document.products,
  })
  const grossWeightGrams = deriveBoxGrossWeightGrams({
    products: imported.document.products,
    volumes: imported.document.volumes,
  })
  if (grossWeightGrams === null) return rows
  return rows.map((row) => ({ ...row, grossWeightGrams }))
}

function logFailure(input: {
  readonly document: NfePackageBoxPendingDocument
  readonly error: unknown
  readonly logger: WorkerLogger | undefined
}): void {
  if (input.logger === undefined) return
  safeLogError({
    logger: input.logger,
    message: 'nfe_package_box_backfill_failed',
    metadata: {
      documentId: input.document.documentId,
      reason: input.error instanceof Error ? input.error.message : 'unknown',
    },
  })
}
