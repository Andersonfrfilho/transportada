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
import { nfePackageBoxes, nfePackageBoxMeasurements } from '../../database/nfe.schema.js'
import type {
  PackageBoxCatalogImportCandidate,
  PackageBoxCatalogImportGroup,
  PackageBoxCatalogImportRepositoryPort,
  PackageBoxCatalogImportWriteResult,
} from '../application/package-box-catalog-import.port.js'

type Database = ReturnType<typeof createDrizzleProvider>
type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0]

/** Simulação (P4): sinalizador interno para forçar `ROLLBACK` sem propagar erro ao chamador. */
class SimulationRollback extends Error {}

export class DrizzlePackageBoxCatalogImportRepository implements PackageBoxCatalogImportRepositoryPort {
  readonly #database: Database['db']

  constructor(database: Database['db']) {
    this.#database = database
  }

  async importCandidates(input: {
    readonly apply: boolean
    readonly groups: readonly PackageBoxCatalogImportGroup[]
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
