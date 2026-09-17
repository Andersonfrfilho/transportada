/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import {
  nfeDocuments,
  nfePackageBoxes,
  nfePackageBoxMeasurements,
  nfeParticipants,
  nfeProducts,
} from '../../database/nfe.schema.js'
import type {
  PackageBoxFilters,
  PackageBoxMeasurement,
  PackageBoxRepositoryPort,
  PackageBoxSiblings,
  PackageBoxSiblingView,
  PackageBoxView,
} from '../application/package-box.port.js'
import {
  resolveBoxFamily,
  resolveEmitterFamilyKey,
  resolvePackagingUnitCount,
} from '../domain/package-box-family.policy.js'
import {
  PackageBoxNotFoundError,
  PackageBoxReplicationSourceNotMeasuredError,
  PackageBoxReplicationTargetAlreadyMeasuredError,
  PackageBoxReplicationTargetOutsideFamilyError,
} from '../domain/package-box-measurement.error.js'
import { countBoxFamilies, countPackagingSiblings } from '../domain/package-box-queue.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzlePackageBoxRepository implements PackageBoxRepositoryPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * Spec 155 (G003, D1, D3): a origem lida por `(id, companyId)`, e as irmãs de família e de
   * embalagem varridas sobre a empresa inteira — mesmo padrão da D9 em `list`, e pelo mesmo motivo:
   * a família não tem coluna própria, e recalcular em SQL duplicaria a regex da D2.
   */
  async getSiblings(input: {
    readonly boxId: string
    readonly companyId: string
  }): Promise<PackageBoxSiblings | null> {
    const [origin] = await this.#database
      .select(SIBLING_COLUMNS)
      .from(nfePackageBoxes)
      .where(
        and(eq(nfePackageBoxes.id, input.boxId), eq(nfePackageBoxes.companyId, input.companyId)),
      )
      .limit(1)
    if (origin === undefined) return null

    const companyBoxes = await this.#database
      .select(SIBLING_COLUMNS)
      .from(nfePackageBoxes)
      .where(eq(nfePackageBoxes.companyId, input.companyId))

    const originFamilyKey = resolveEmitterFamilyKey(origin)

    const family =
      originFamilyKey === undefined
        ? []
        : companyBoxes.filter(
            (box) => box.id !== origin.id && resolveEmitterFamilyKey(box) === originFamilyKey,
          )
    const packaging = companyBoxes.filter(
      (box) =>
        box.id !== origin.id &&
        box.productCode === origin.productCode &&
        box.emitterTaxId === origin.emitterTaxId,
    )

    return {
      family: family.map(toSiblingView),
      originVariantLabel: resolveBoxFamily(origin).variantLabel,
      packaging: packaging.map(toSiblingView),
    }
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
        measurementMarginMm: nfePackageBoxes.measurementMarginMm,
        measurementSource: nfePackageBoxes.measurementSource,
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
          buildStatusFilter(input.filters.status),
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

    /**
     * ⚠️ D9: o contador de família e de embalagem tem de ver a empresa inteira, não a janela do
     * `LIMIT` acima — senão ele mente para toda família que atravessa a borda dos 50 primeiros.
     * 663 linhas de texto curto em produção; carregar todas é mais barato que reescrever a regex
     * da D2 em SQL (tasks.md T2.2).
     */
    const companyBoxes = await this.#database
      .select({
        commercialUnit: nfePackageBoxes.commercialUnit,
        description: nfePackageBoxes.description,
        emitterTaxId: nfePackageBoxes.emitterTaxId,
        id: nfePackageBoxes.id,
        measuredAt: nfePackageBoxes.measuredAt,
        productCode: nfePackageBoxes.productCode,
      })
      .from(nfePackageBoxes)
      .where(eq(nfePackageBoxes.companyId, input.companyId))

    const familyCounts = countBoxFamilies(
      companyBoxes.map((box) => ({ ...box, measured: box.measuredAt !== null })),
    )
    const packagingCounts = countPackagingSiblings(companyBoxes)

    return rows.map((row) => {
      const family = familyCounts.get(row.id)
      const packaging = packagingCounts.get(row.id)

      return {
        ...row,
        familyKey: family?.familyKey,
        familyMeasuredCount: family?.familyMeasuredCount ?? 0,
        familyPendingCount: family?.familyPendingCount ?? 0,
        measuredAt: row.measuredAt?.toISOString() ?? null,
        packagingSiblingCount: packaging?.packagingSiblingCount ?? 0,
        packagingUnitCount: packaging?.packagingUnitCount,
        transportedVolumes: Number(row.transportedVolumes ?? 0),
        variantLabel: family?.variantLabel ?? '',
      }
    })
  }

  /**
   * Spec 152 (D5, D17, experimental): a caixa e o histórico append-only gravam na **mesma**
   * transação — sem casar caixa nenhuma (outra empresa ou id inexistente), nem a caixa nem o
   * histórico mudam.
   */
  async measure(input: {
    readonly boxId: string
    readonly companyId: string
    readonly measurement: PackageBoxMeasurement
    readonly measurementMarginMm: number | null
    readonly measuredByUserId: string
  }): Promise<boolean> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .update(nfePackageBoxes)
        .set({
          grossWeightGrams: input.measurement.grossWeightGrams,
          heightMm: input.measurement.heightMm,
          lengthMm: input.measurement.lengthMm,
          measuredAt: new Date(),
          measurementMarginMm: input.measurementMarginMm,
          measurementSource: input.measurement.source,
          unitsPerBox: input.measurement.unitsPerBox,
          updatedAt: new Date(),
          widthMm: input.measurement.widthMm,
        })
        .where(
          and(eq(nfePackageBoxes.id, input.boxId), eq(nfePackageBoxes.companyId, input.companyId)),
        )
        .returning({ id: nfePackageBoxes.id })

      if (rows.length === 0) return false

      const camera = input.measurement.camera
      await transaction.insert(nfePackageBoxMeasurements).values({
        companyId: input.companyId,
        engine: camera?.engine ?? null,
        heightMarginMm: camera?.heightMarginMm ?? null,
        heightMm: input.measurement.heightMm,
        impreciseConfirmed: camera?.impreciseConfirmed ?? false,
        lengthMarginMm: camera?.lengthMarginMm ?? null,
        lengthMm: input.measurement.lengthMm,
        measuredByUserId: input.measuredByUserId,
        packageBoxId: input.boxId,
        proposedHeightMm: camera?.proposedHeightMm ?? null,
        proposedLengthMm: camera?.proposedLengthMm ?? null,
        proposedWidthMm: camera?.proposedWidthMm ?? null,
        source: input.measurement.source,
        warnings: camera?.warnings === undefined ? [] : [...camera.warnings],
        widthMarginMm: camera?.widthMarginMm ?? null,
        widthMm: input.measurement.widthMm,
      })

      return true
    })
  }

  /**
   * Spec 155 (D1, D4, D6, G004, G005, G006, G007): origem e alvos lidos **dentro** da transação que
   * escreve — sem isso, uma leitura fora da transação abriria uma corrida entre duas réplicas
   * concorrentes que passam as duas na validação e escrevem sobre o mesmo alvo. Tudo-ou-nada: o
   * primeiro alvo inválido lança e desfaz a transação inteira, nenhum alvo é gravado pela metade.
   */
  async replicate(input: {
    readonly boxId: string
    readonly companyId: string
    readonly measuredByUserId: string
    readonly targetIds: readonly string[]
  }): Promise<number> {
    return this.#database.transaction(async (transaction) => {
      const [origin] = await transaction
        .select({
          commercialUnit: nfePackageBoxes.commercialUnit,
          description: nfePackageBoxes.description,
          emitterTaxId: nfePackageBoxes.emitterTaxId,
          grossWeightGrams: nfePackageBoxes.grossWeightGrams,
          heightMm: nfePackageBoxes.heightMm,
          id: nfePackageBoxes.id,
          lengthMm: nfePackageBoxes.lengthMm,
          unitsPerBox: nfePackageBoxes.unitsPerBox,
          widthMm: nfePackageBoxes.widthMm,
        })
        .from(nfePackageBoxes)
        .where(
          and(eq(nfePackageBoxes.id, input.boxId), eq(nfePackageBoxes.companyId, input.companyId)),
        )
        .limit(1)
      if (origin === undefined) throw new PackageBoxNotFoundError()
      /**
       * As três dimensões são tudo-ou-nada por CHECK (`nfe_package_boxes_dimensions_together_check`)
       * — conferir as três aqui é só o que deixa o TypeScript estreitar os tipos para a gravação
       * abaixo, não uma segunda fonte de verdade.
       */
      if (origin.lengthMm === null || origin.widthMm === null || origin.heightMm === null) {
        throw new PackageBoxReplicationSourceNotMeasuredError()
      }
      /** A narrowing acima não atravessa a closure do `.map` abaixo — por isso os locais explícitos. */
      const sourceHeightMm = origin.heightMm
      const sourceLengthMm = origin.lengthMm
      const sourceWidthMm = origin.widthMm

      const originFamilyKey = resolveEmitterFamilyKey(origin)
      /** Sem família não há com quem replicar — e `undefined === undefined` não é parentesco. */
      if (originFamilyKey === undefined) throw new PackageBoxReplicationTargetOutsideFamilyError()

      const targets = await transaction
        .select({
          commercialUnit: nfePackageBoxes.commercialUnit,
          description: nfePackageBoxes.description,
          emitterTaxId: nfePackageBoxes.emitterTaxId,
          id: nfePackageBoxes.id,
          measuredAt: nfePackageBoxes.measuredAt,
        })
        .from(nfePackageBoxes)
        .where(
          and(
            eq(nfePackageBoxes.companyId, input.companyId),
            inArray(nfePackageBoxes.id, [...input.targetIds]),
          ),
        )
      const targetsById = new Map(targets.map((target) => [target.id, target]))

      for (const targetId of input.targetIds) {
        const target = targetsById.get(targetId)
        if (target === undefined) throw new PackageBoxNotFoundError()
        if (resolveEmitterFamilyKey(target) !== originFamilyKey) {
          throw new PackageBoxReplicationTargetOutsideFamilyError()
        }
        if (target.measuredAt !== null) throw new PackageBoxReplicationTargetAlreadyMeasuredError()
      }

      const updated = await transaction
        .update(nfePackageBoxes)
        .set({
          grossWeightGrams: origin.grossWeightGrams,
          heightMm: origin.heightMm,
          lengthMm: origin.lengthMm,
          measuredAt: new Date(),
          measurementMarginMm: null,
          measurementSource: 'replicated',
          unitsPerBox: origin.unitsPerBox,
          updatedAt: new Date(),
          widthMm: origin.widthMm,
        })
        .where(
          and(
            eq(nfePackageBoxes.companyId, input.companyId),
            inArray(nfePackageBoxes.id, [...input.targetIds]),
            /** D4 sob concorrência: a leitura acima pode ter visto o alvo antes de alguém medi-lo. */
            isNull(nfePackageBoxes.measuredAt),
          ),
        )
        .returning({ id: nfePackageBoxes.id })
      if (updated.length !== input.targetIds.length) {
        throw new PackageBoxReplicationTargetAlreadyMeasuredError()
      }

      if (updated.length > 0) {
        await transaction.insert(nfePackageBoxMeasurements).values(
          updated.map((target) => ({
            companyId: input.companyId,
            heightMm: sourceHeightMm,
            lengthMm: sourceLengthMm,
            measuredByUserId: input.measuredByUserId,
            packageBoxId: target.id,
            replicatedFromBoxId: origin.id,
            source: 'replicated' as const,
            widthMm: sourceWidthMm,
          })),
        )
      }

      return updated.length
    })
  }
}

const SIBLING_COLUMNS = {
  commercialUnit: nfePackageBoxes.commercialUnit,
  description: nfePackageBoxes.description,
  emitterTaxId: nfePackageBoxes.emitterTaxId,
  grossWeightGrams: nfePackageBoxes.grossWeightGrams,
  heightMm: nfePackageBoxes.heightMm,
  id: nfePackageBoxes.id,
  lengthMm: nfePackageBoxes.lengthMm,
  measuredAt: nfePackageBoxes.measuredAt,
  productCode: nfePackageBoxes.productCode,
  unitsPerBox: nfePackageBoxes.unitsPerBox,
  widthMm: nfePackageBoxes.widthMm,
} as const

type SiblingRow = {
  readonly commercialUnit: string
  readonly description: string
  readonly emitterTaxId: string
  readonly grossWeightGrams: number | null
  readonly heightMm: number | null
  readonly id: string
  readonly lengthMm: number | null
  readonly measuredAt: Date | null
  readonly productCode: string
  readonly unitsPerBox: number
  readonly widthMm: number | null
}

function toSiblingView(row: SiblingRow): PackageBoxSiblingView {
  return {
    commercialUnit: row.commercialUnit,
    description: row.description,
    grossWeightGrams: row.grossWeightGrams,
    heightMm: row.heightMm,
    id: row.id,
    lengthMm: row.lengthMm,
    measuredAt: row.measuredAt?.toISOString() ?? null,
    packagingUnitCount: resolvePackagingUnitCount(row.commercialUnit),
    productCode: row.productCode,
    unitsPerBox: row.unitsPerBox,
    variantLabel: resolveBoxFamily(row).variantLabel,
    widthMm: row.widthMm,
  }
}

function buildStatusFilter(status: PackageBoxFilters['status']) {
  if (status === 'measured') return isNotNull(nfePackageBoxes.measuredAt)
  if (status === 'all') return undefined
  return isNull(nfePackageBoxes.measuredAt)
}

/**
 * A etiqueta que o conferente bipou, casada contra **duas** colunas.
 *
 * ⚠️ `carton_gtin` vem do `cEAN` do produto (fiscal-provider 0.3.2), gravado pelo worker já
 * reduzido a GTIN-13 e só com dígito verificador válido — mas fica nulo quando a nota traz
 * "SEM GTIN" ou código inválido. Casar **só** por ele devolveria lista vazia nesses casos, e é
 * comum o emitente usar o próprio EAN como `cProd`: por isso o bipe casa as duas colunas.
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
