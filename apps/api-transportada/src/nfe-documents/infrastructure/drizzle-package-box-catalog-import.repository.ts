/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162 — escritas condicionais do importador de catálogo, todas dentro de uma única transação
 * por execução (RNF01, P4). Nunca sobrescreve medida humana: toda escrita em `nfe_package_boxes` é
 * condicional a `length_mm is null` (P3), e a proposta em `nfe_package_box_measurements` é
 * condicional a não existir já uma linha `source = 'catalog'` com o mesmo motor e as mesmas
 * arestas para a caixa (RF07, idempotência).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { CATALOG_IMPORT_ACTOR_ID } from '../domain/package-box-catalog-import.constant.js'
import { estimateStorablePackageBoxFromUnit } from '../domain/package-box-estimate.policy.js'
import { nfePackageBoxes, nfePackageBoxMeasurements } from '../../database/nfe.schema.js'
import type {
  PackageBoxCatalogImportCandidate,
  PackageBoxCatalogImportGroup,
  PackageBoxCatalogImportRepositoryPort,
  PackageBoxCatalogImportUnit,
  PackageBoxCatalogImportWriteResult,
} from '../application/package-box-catalog-import.port.js'

type Database = ReturnType<typeof createDrizzleProvider>
type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0]

/** Simulação (P4): sinalizador interno para forçar `ROLLBACK` sem propagar erro ao chamador. */
class SimulationRollback extends Error {}

export class DrizzlePackageBoxCatalogImportRepository
  implements PackageBoxCatalogImportRepositoryPort
{
  readonly #database: Database['db']

  constructor(database: Database['db']) {
    this.#database = database
  }

  async importCandidates(input: {
    readonly apply: boolean
    readonly groups: readonly PackageBoxCatalogImportGroup[]
    readonly units: readonly PackageBoxCatalogImportUnit[]
  }): Promise<readonly PackageBoxCatalogImportWriteResult[]> {
    const results: PackageBoxCatalogImportWriteResult[] = []

    try {
      await this.#database.transaction(async (transaction) => {
        for (const group of input.groups) {
          const boxes = await transaction
            .select({ companyId: nfePackageBoxes.companyId, id: nfePackageBoxes.id })
            .from(nfePackageBoxes)
            .where(
              and(
                eq(nfePackageBoxes.cartonGtin, group.cartonGtin),
                isNull(nfePackageBoxes.lengthMm),
              ),
            )

          if (boxes.length === 0) {
            results.push({ cartonGtin: group.cartonGtin, outcome: 'no_matching_box' })
            continue
          }

          for (const box of boxes) {
            const outcome = group.promoted
              ? await this.#promote(transaction, box, group)
              : await this.#propose(transaction, box, group)
            results.push({
              boxId: box.id,
              cartonGtin: group.cartonGtin,
              companyId: box.companyId,
              outcome,
            })
          }
        }

        // Spec 163 (RF05): depois das caixas — uma promoção desta mesma execução já trava a estimativa.
        for (const unit of input.units) {
          results.push(...(await this.#recordUnit(transaction, unit)))
        }

        if (!input.apply) throw new SimulationRollback()
      })
    } catch (error) {
      if (!(error instanceof SimulationRollback)) throw error
    }

    return results
  }

  /** RF05 (fonte única): grava só o histórico com `proposed_*_mm`; a caixa não muda. */
  async #propose(
    transaction: Transaction,
    box: { readonly companyId: string; readonly id: string },
    group: PackageBoxCatalogImportGroup,
  ): Promise<'duplicate' | 'proposed'> {
    const candidate = group.candidates[0]
    if (candidate === undefined) return 'duplicate'

    const duplicate = await this.#hasExistingProposal(transaction, box.id, candidate)
    if (duplicate) return 'duplicate'

    await transaction.insert(nfePackageBoxMeasurements).values({
      companyId: box.companyId,
      engine: candidate.engine,
      heightMm: candidate.heightMm,
      lengthMm: candidate.lengthMm,
      measuredByUserId: CATALOG_IMPORT_ACTOR_ID,
      packageBoxId: box.id,
      proposedHeightMm: candidate.heightMm,
      proposedLengthMm: candidate.lengthMm,
      proposedWidthMm: candidate.widthMm,
      source: 'catalog',
      widthMm: candidate.widthMm,
    })
    return 'proposed'
  }

  /** RF05 (consenso de duas fontes): grava caixa e histórico juntos, condicional a `length_mm is null`. */
  async #promote(
    transaction: Transaction,
    box: { readonly companyId: string; readonly id: string },
    group: PackageBoxCatalogImportGroup,
  ): Promise<'promoted' | 'skipped_measured'> {
    const candidate = group.candidates[0]
    if (candidate === undefined) return 'skipped_measured'
    const engine = group.candidates.map((item) => item.engine).join('+')

    const updated = await transaction
      .update(nfePackageBoxes)
      .set({
        grossWeightGrams: candidate.grossWeightGrams > 0 ? candidate.grossWeightGrams : null,
        heightMm: candidate.heightMm,
        lengthMm: candidate.lengthMm,
        measuredAt: new Date(),
        measurementSource: 'catalog',
        unitsPerBox: candidate.unitsPerBox,
        updatedAt: new Date(),
        widthMm: candidate.widthMm,
      })
      .where(and(eq(nfePackageBoxes.id, box.id), isNull(nfePackageBoxes.lengthMm)))
      .returning({ id: nfePackageBoxes.id })

    if (updated.length === 0) return 'skipped_measured'

    await transaction.insert(nfePackageBoxMeasurements).values({
      companyId: box.companyId,
      engine,
      heightMm: candidate.heightMm,
      lengthMm: candidate.lengthMm,
      measuredByUserId: CATALOG_IMPORT_ACTOR_ID,
      packageBoxId: box.id,
      proposedHeightMm: candidate.heightMm,
      proposedLengthMm: candidate.lengthMm,
      proposedWidthMm: candidate.widthMm,
      source: 'catalog',
      widthMm: candidate.widthMm,
    })
    return 'promoted'
  }

  /**
   * Spec 163 (RF04, RF05, RNF02): grava a unidade em toda caixa do `cartonGtin` (cada uma na sua
   * empresa), sem nunca sobrescrever unidade digitada (`typed`), e recalcula a estimativa só na
   * caixa sem medida real. Nenhum `set` daqui toca `length_mm` & cia. nem `measurement_source`.
   */
  async #recordUnit(
    transaction: Transaction,
    unit: PackageBoxCatalogImportUnit,
  ): Promise<readonly PackageBoxCatalogImportWriteResult[]> {
    const boxes = await transaction
      .select({
        companyId: nfePackageBoxes.companyId,
        id: nfePackageBoxes.id,
        lengthMm: nfePackageBoxes.lengthMm,
        unitMeasurementSource: nfePackageBoxes.unitMeasurementSource,
        unitsPerBox: nfePackageBoxes.unitsPerBox,
      })
      .from(nfePackageBoxes)
      .where(eq(nfePackageBoxes.cartonGtin, unit.cartonGtin))
      .for('update')
    if (boxes.length === 0) return [{ cartonGtin: unit.cartonGtin, outcome: 'no_matching_box' }]

    const results: PackageBoxCatalogImportWriteResult[] = []
    for (const box of boxes) {
      const outcome = await this.#writeUnit(transaction, box, unit)
      results.push({
        boxId: box.id,
        cartonGtin: unit.cartonGtin,
        companyId: box.companyId,
        outcome,
      })
    }
    return results
  }

  async #writeUnit(
    transaction: Transaction,
    box: {
      readonly companyId: string
      readonly id: string
      readonly lengthMm: number | null
      readonly unitMeasurementSource: string | null
      readonly unitsPerBox: number
    },
    unit: PackageBoxCatalogImportUnit,
  ): Promise<'unit_recorded' | 'unit_skipped_typed'> {
    if (box.unitMeasurementSource === 'typed') return 'unit_skipped_typed'
    const estimate =
      box.lengthMm === null
        ? estimateStorablePackageBoxFromUnit({ unit, unitsPerBox: box.unitsPerBox })
        : undefined
    const now = new Date()
    await transaction
      .update(nfePackageBoxes)
      .set({
        unitGrossWeightGrams: unit.grossWeightGrams ?? null,
        unitHeightMm: unit.heightMm,
        unitLengthMm: unit.lengthMm,
        unitMeasurementSource: unit.source,
        unitWidthMm: unit.widthMm,
        updatedAt: now,
        ...(box.lengthMm === null
          ? {
              estimatedArrangement: estimate?.arrangement ?? null,
              estimatedAt: estimate === undefined ? null : now,
              estimatedGrossWeightGrams: estimate?.grossWeightGrams ?? null,
              estimatedHeightMm: estimate?.heightMm ?? null,
              estimatedLengthMm: estimate?.lengthMm ?? null,
              estimatedVolumeCm3: estimate?.volumeCm3 ?? null,
              estimatedWidthMm: estimate?.widthMm ?? null,
            }
          : {}),
      })
      .where(and(eq(nfePackageBoxes.id, box.id), eq(nfePackageBoxes.companyId, box.companyId)))
    return 'unit_recorded'
  }

  async #hasExistingProposal(
    transaction: Transaction,
    boxId: string,
    candidate: PackageBoxCatalogImportCandidate,
  ): Promise<boolean> {
    const [existing] = await transaction
      .select({ id: nfePackageBoxMeasurements.id })
      .from(nfePackageBoxMeasurements)
      .where(
        and(
          eq(nfePackageBoxMeasurements.packageBoxId, boxId),
          eq(nfePackageBoxMeasurements.source, 'catalog'),
          eq(nfePackageBoxMeasurements.engine, candidate.engine),
          eq(nfePackageBoxMeasurements.lengthMm, candidate.lengthMm),
          eq(nfePackageBoxMeasurements.widthMm, candidate.widthMm),
          eq(nfePackageBoxMeasurements.heightMm, candidate.heightMm),
        ),
      )
      .limit(1)
    return existing !== undefined
  }
}
