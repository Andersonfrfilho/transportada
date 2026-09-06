/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'

import {
  nfeDocuments,
  nfePackageBoxes,
  nfeParticipants,
  nfeProducts,
} from '../../database/nfe.schema.js'
import type {
  PackageBoxFilters,
  PackageBoxMeasurement,
  PackageBoxRepositoryPort,
  PackageBoxView,
} from '../application/package-box.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzlePackageBoxRepository implements PackageBoxRepositoryPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * ⚠️ O volume transportado é `sum(nfe_products.quantity)` do par `(emitente, cProd, uCom)`, e não
   * uma consulta a `nfe_volumes`: medido em 345 NF-e, `qVol` = Σ `qCom` em **100%** delas — cada
   * volume da nota é uma caixa. Somar pelo produto é a mesma grandeza sem o join extra.
   */
  async list(input: {
    readonly companyId: string
    readonly filters: PackageBoxFilters
    readonly limit: number
  }): Promise<readonly PackageBoxView[]> {
    const transported = this.#database
      .select({
        commercialUnit: nfeProducts.commercialUnit,
        emitterTaxId: nfeParticipants.taxId,
        productCode: nfeProducts.code,
        volumes: sql<string>`sum(${nfeProducts.quantity})`.as('volumes'),
      })
      .from(nfeProducts)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.id, nfeProducts.documentId),
          eq(nfeDocuments.companyId, nfeProducts.companyId),
        ),
      )
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.documentId, nfeDocuments.id),
          eq(nfeParticipants.companyId, nfeDocuments.companyId),
          eq(nfeParticipants.role, 'emitter'),
        ),
      )
      .where(eq(nfeProducts.companyId, input.companyId))
      .groupBy(nfeParticipants.taxId, nfeProducts.code, nfeProducts.commercialUnit)
      .as('transported')

    const search = input.filters.search
    const rows = await this.#database
      .select({
        cartonGtin: nfePackageBoxes.cartonGtin,
        commercialUnit: nfePackageBoxes.commercialUnit,
        description: nfePackageBoxes.description,
        emitterTaxId: nfePackageBoxes.emitterTaxId,
        grossWeightGrams: nfePackageBoxes.grossWeightGrams,
        heightMm: nfePackageBoxes.heightMm,
        id: nfePackageBoxes.id,
        lengthMm: nfePackageBoxes.lengthMm,
        measuredAt: nfePackageBoxes.measuredAt,
        productCode: nfePackageBoxes.productCode,
        transportedVolumes: sql<string>`coalesce(${transported.volumes}, 0)`,
        unitsPerBox: nfePackageBoxes.unitsPerBox,
        widthMm: nfePackageBoxes.widthMm,
      })
      .from(nfePackageBoxes)
      .leftJoin(
        transported,
        and(
          eq(transported.emitterTaxId, nfePackageBoxes.emitterTaxId),
          eq(transported.productCode, nfePackageBoxes.productCode),
          eq(transported.commercialUnit, nfePackageBoxes.commercialUnit),
        ),
      )
      .where(
        and(
          eq(nfePackageBoxes.companyId, input.companyId),
          input.filters.pendingOnly === true ? isNull(nfePackageBoxes.measuredAt) : undefined,
          buildScanFilter(input.filters.scanCodes),
          search === undefined
            ? undefined
            : or(
                ilike(nfePackageBoxes.description, `%${search}%`),
                ilike(nfePackageBoxes.productCode, `%${search}%`),
              ),
        ),
      )
      /**
       * ⚠️ `coalesce`, e não `desc(volumes)`: em Postgres `ORDER BY x DESC` é **NULLS FIRST**, e o
       * `leftJoin` produz nulo em toda caixa que ainda não casou com linha de nota. Sem isto, com
       * 663 caixas e `limit=50`, a tela abria com as órfãs e as doze que cobrem um quarto dos
       * volumes ficavam fora da página — a política reordena o que recebeu, não o que o `LIMIT` já
       * cortou.
       */
      .orderBy(sql`coalesce(${transported.volumes}, 0) desc`)
      .limit(input.limit)

    return rows.map((row) => ({
      ...row,
      measuredAt: row.measuredAt?.toISOString() ?? null,
      transportedVolumes: Number(row.transportedVolumes ?? 0),
    }))
  }

  async measure(input: {
    readonly boxId: string
    readonly companyId: string
    readonly measurement: PackageBoxMeasurement
  }): Promise<boolean> {
    const rows = await this.#database
      .update(nfePackageBoxes)
      .set({
        grossWeightGrams: input.measurement.grossWeightGrams,
        heightMm: input.measurement.heightMm,
        lengthMm: input.measurement.lengthMm,
        measuredAt: new Date(),
        unitsPerBox: input.measurement.unitsPerBox,
        updatedAt: new Date(),
        widthMm: input.measurement.widthMm,
      })
      .where(
        and(eq(nfePackageBoxes.id, input.boxId), eq(nfePackageBoxes.companyId, input.companyId)),
      )
      .returning({ id: nfePackageBoxes.id })

    return rows.length > 0
  }
}

/**
 * A etiqueta que o conferente bipou, casada contra **duas** colunas.
 *
 * ⚠️ `carton_gtin` é hoje nulo em toda linha: `NfeXmlProduct` do `@adatechnology/fiscal-provider`
 * não expõe `cEAN`, a mesma lacuna de pacote do caso `<email>`, então a importação não tem de onde
 * escrevê-lo. Casar **só** por ele devolveria lista vazia em todo bipe — e é comum o emitente usar
 * o próprio EAN como `cProd`, que é o que salva a leitura enquanto o campo não existe.
 *
 * Os códigos chegam já em conjunto (o lido e o reduzido a GTIN-13): quem decide a redução é a
 * política, não o SQL.
 */
function buildScanFilter(scanCodes: readonly string[] | undefined) {
  if (scanCodes === undefined) return undefined
  /** Leitura que não vira código nenhum é **busca vazia**, nunca ausência de filtro. */
  if (scanCodes.length === 0) return sql`false`
  return or(
    inArray(nfePackageBoxes.cartonGtin, [...scanCodes]),
    inArray(nfePackageBoxes.productCode, [...scanCodes]),
  )
}
