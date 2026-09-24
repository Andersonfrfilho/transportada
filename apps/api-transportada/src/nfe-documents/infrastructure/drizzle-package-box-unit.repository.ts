/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { nfePackageBoxes } from '../../database/nfe.schema.js'
import type {
  PackageBoxStoredEstimate,
  PackageBoxUnitRepositoryPort,
  PackageBoxUnitTarget,
  SavePackageBoxUnitInput,
} from '../application/package-box-unit.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

function toEstimateColumns(estimate: PackageBoxStoredEstimate | null): {
  readonly estimatedArrangement: string | null
  readonly estimatedAt: Date | null
  readonly estimatedGrossWeightGrams: number | null
  readonly estimatedHeightMm: number | null
  readonly estimatedLengthMm: number | null
  readonly estimatedVolumeCm3: number | null
  readonly estimatedWidthMm: number | null
} {
  return {
    estimatedArrangement: estimate?.arrangement ?? null,
    estimatedAt: estimate?.estimatedAt ?? null,
    estimatedGrossWeightGrams: estimate?.grossWeightGrams ?? null,
    estimatedHeightMm: estimate?.heightMm ?? null,
    estimatedLengthMm: estimate?.lengthMm ?? null,
    estimatedVolumeCm3: estimate?.volumeCm3 ?? null,
    estimatedWidthMm: estimate?.widthMm ?? null,
  }
}

/**
 * Spec 163 — grava a medida da unidade. ⚠️ RNF02: nenhum `set` daqui toca `length_mm`, `width_mm`,
 * `height_mm`, `measured_at` ou `measurement_source`.
 */
export class DrizzlePackageBoxUnitRepository implements PackageBoxUnitRepositoryPort {
  readonly #database: Database

  public constructor(database: Database) {
    this.#database = database
  }

  async findUnitTarget(input: {
    readonly boxId: string
    readonly companyId: string
  }): Promise<PackageBoxUnitTarget | null> {
    const [row] = await this.#database
      .select({ unitsPerBox: nfePackageBoxes.unitsPerBox })
      .from(nfePackageBoxes)
      .where(
        and(eq(nfePackageBoxes.id, input.boxId), eq(nfePackageBoxes.companyId, input.companyId)),
      )
      .limit(1)
    return row ?? null
  }

  async saveUnit(input: SavePackageBoxUnitInput): Promise<boolean> {
    return this.#database.transaction(async (transaction) => {
      const boxFilter = and(
        eq(nfePackageBoxes.id, input.boxId),
        eq(nfePackageBoxes.companyId, input.companyId),
      )
      /** Trava a caixa: uma medida real concorrente espera, e a estimativa nunca a atropela (RF04). */
      const [current] = await transaction
        .select({ lengthMm: nfePackageBoxes.lengthMm })
        .from(nfePackageBoxes)
        .where(boxFilter)
        .for('update')
        .limit(1)
      if (current === undefined) return false

      const hasRealMeasurement = current.lengthMm !== null
      await transaction
        .update(nfePackageBoxes)
        .set({
          unitGrossWeightGrams: input.unit.grossWeightGrams ?? null,
          unitHeightMm: input.unit.heightMm,
          unitLengthMm: input.unit.lengthMm,
          unitMeasurementSource: input.unitSource,
          unitWidthMm: input.unit.widthMm,
          updatedAt: new Date(),
          ...(input.unitsPerBox === undefined ? {} : { unitsPerBox: input.unitsPerBox }),
          ...(hasRealMeasurement ? {} : toEstimateColumns(input.estimate)),
        })
        .where(boxFilter)
      return true
    })
  }
}
