/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'

import {
  nfeDocuments,
  nfePackageBoxes,
  nfeProducts,
  storedObjects,
} from '../../database/nfe.schema.js'
import type { NfePackageBoxPendingDocument } from '../application/nfe-package-box-backfill.service.js'
import type {
  NfePackageBoxGtinBackfillRepository,
  PendingCartonBox,
} from '../application/nfe-package-box-gtin-backfill.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfePackageBoxGtinBackfillRepository
  implements NfePackageBoxGtinBackfillRepository
{
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listCompaniesWithPendingBoxes(): Promise<readonly string[]> {
    const rows = await this.#database
      .selectDistinct({ companyId: nfePackageBoxes.companyId })
      .from(nfePackageBoxes)
      .where(isNull(nfePackageBoxes.cartonGtin))
      .orderBy(asc(nfePackageBoxes.companyId))
    return rows.map((row) => row.companyId)
  }

  /**
   * Só as notas com algum produto cuja caixa ainda está sem GTIN. O emitente não entra no filtro
   * (ele mora no XML): o recorte é mais largo que o necessário, e quem decide é `findPendingBoxes`.
   */
  async listPendingDocuments(input: {
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
          sql`exists (
            select 1 from ${nfeProducts}
            inner join ${nfePackageBoxes}
              on ${nfePackageBoxes.companyId} = ${nfeProducts.companyId}
             and ${nfePackageBoxes.productCode} = ${nfeProducts.code}
             and ${nfePackageBoxes.commercialUnit} = ${nfeProducts.commercialUnit}
             and ${nfePackageBoxes.cartonGtin} is null
            where ${nfeProducts.companyId} = ${nfeDocuments.companyId}
              and ${nfeProducts.documentId} = ${nfeDocuments.id}
          )`,
        ),
      )
      .orderBy(asc(nfeDocuments.id))
      .limit(input.limit)
  }

  async findPendingBoxes(input: {
    readonly companyId: string
    readonly emitterTaxId: string
    readonly keys: readonly { readonly commercialUnit: string; readonly productCode: string }[]
  }): Promise<readonly PendingCartonBox[]> {
    if (input.keys.length === 0) return []

    return this.#database
      .select({
        commercialUnit: nfePackageBoxes.commercialUnit,
        emitterTaxId: nfePackageBoxes.emitterTaxId,
        id: nfePackageBoxes.id,
        productCode: nfePackageBoxes.productCode,
      })
      .from(nfePackageBoxes)
      .where(
        and(
          eq(nfePackageBoxes.companyId, input.companyId),
          eq(nfePackageBoxes.emitterTaxId, input.emitterTaxId),
          isNull(nfePackageBoxes.cartonGtin),
          or(
            ...input.keys.map((key) =>
              and(
                eq(nfePackageBoxes.productCode, key.productCode),
                eq(nfePackageBoxes.commercialUnit, key.commercialUnit),
              ),
            ),
          ),
        ),
      )
  }

  /** `carton_gtin is null` no WHERE: rodar de novo é no-op, e GTIN gravado nunca é trocado. */
  async fillCartonGtin(input: {
    readonly boxIds: readonly string[]
    readonly cartonGtin: string
    readonly companyId: string
  }): Promise<number> {
    if (input.boxIds.length === 0) return 0

    const rows = await this.#database
      .update(nfePackageBoxes)
      .set({ cartonGtin: input.cartonGtin })
      .where(
        and(
          eq(nfePackageBoxes.companyId, input.companyId),
          inArray(nfePackageBoxes.id, [...input.boxIds]),
          isNull(nfePackageBoxes.cartonGtin),
        ),
      )
      .returning({ id: nfePackageBoxes.id })
    return rows.length
  }
}
