/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import { companyCargoVolumeFactors } from '../../database/company-cargo-volume-factor.schema.js'
import type {
  CargoVolumeFactor,
  CargoVolumeFactorPort,
} from '../application/cargo-volume-factor.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCargoVolumeFactorRepository implements CargoVolumeFactorPort {
  public constructor(private readonly database: Database) {}

  public async list({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<readonly CargoVolumeFactor[]> {
    return this.database
      .select({
        species: companyCargoVolumeFactors.species,
        volumePerUnitM3: companyCargoVolumeFactors.volumePerUnitM3,
      })
      .from(companyCargoVolumeFactors)
      .where(eq(companyCargoVolumeFactors.companyId, companyId))
      .orderBy(asc(companyCargoVolumeFactors.species))
  }

  public async remove({
    companyId,
    species,
  }: {
    readonly companyId: string
    readonly species: string
  }): Promise<void> {
    await this.database
      .delete(companyCargoVolumeFactors)
      .where(
        and(
          eq(companyCargoVolumeFactors.companyId, companyId),
          eq(companyCargoVolumeFactors.species, species),
        ),
      )
  }

  /**
   * A ausência da linha é o desligado (spec 075): não existe "salvar zero", porque o CHECK do banco
   * o recusa. Desligar é `remove`.
   */
  public async save({
    companyId,
    species,
    volumePerUnitM3,
  }: {
    readonly companyId: string
    readonly species: string
    readonly volumePerUnitM3: string
  }): Promise<void> {
    await this.database
      .insert(companyCargoVolumeFactors)
      .values({ companyId, species, volumePerUnitM3 })
      .onConflictDoUpdate({
        set: { updatedAt: new Date(), volumePerUnitM3 },
        target: [companyCargoVolumeFactors.companyId, companyCargoVolumeFactors.species],
      })
  }
}
