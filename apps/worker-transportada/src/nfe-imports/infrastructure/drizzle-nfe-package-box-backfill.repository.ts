/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt } from 'drizzle-orm'

import { nfeDocuments, nfePackageBoxes, storedObjects } from '../../database/nfe.schema.js'
import type { PackageBoxRow } from '../domain/package-box.policy.js'
import type {
  NfePackageBoxBackfillRepository,
  NfePackageBoxPendingDocument,
} from '../application/nfe-package-box-backfill.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfePackageBoxBackfillRepository implements NfePackageBoxBackfillRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listArchivedDocuments(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfePackageBoxPendingDocument[]> {
    return this.#database
      .select({
        bucket: storedObjects.bucket,
        documentId: nfeDocuments.id,
        objectKey: storedObjects.objectKey,
      })
      .from(nfeDocuments)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.id, nfeDocuments.xmlObjectId),
          eq(storedObjects.companyId, nfeDocuments.companyId),
        ),
      )
      .where(
        and(
          eq(nfeDocuments.companyId, input.companyId),
          input.cursor === undefined ? undefined : gt(nfeDocuments.id, input.cursor),
        ),
      )
      .orderBy(asc(nfeDocuments.id))
      .limit(input.limit)
  }

  async insertPackageBoxes(input: {
    readonly boxes: readonly (PackageBoxRow & { readonly grossWeightGrams?: number })[]
    readonly companyId: string
  }): Promise<number> {
    if (input.boxes.length === 0) return 0

    const rows = await this.#database
      .insert(nfePackageBoxes)
      .values(input.boxes.map((box) => ({ ...box, companyId: input.companyId })))
      .onConflictDoNothing({
        target: [
          nfePackageBoxes.companyId,
          nfePackageBoxes.emitterTaxId,
          nfePackageBoxes.productCode,
          nfePackageBoxes.commercialUnit,
        ],
      })
      .returning({ id: nfePackageBoxes.id })

    return rows.length
  }
}
