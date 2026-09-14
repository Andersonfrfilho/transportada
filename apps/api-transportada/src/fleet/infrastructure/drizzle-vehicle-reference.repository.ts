/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc } from 'drizzle-orm'

import { vehicleVolumeReferences } from '../../database/database.schema.js'
import type {
  VehicleReference,
  VehicleReferencePort,
} from '../application/vehicle-reference.port.js'
import type { VehicleType } from '../../shared/vehicle-type.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * ⚠️ **Sem `company_id` no `where`, e é o único repositório do produto assim** — ao lado do preço da
 * ANP e da tarifa da ANEEL. A tabela é catálogo de mercado: idêntica para toda instalação, sem PII e
 * sem efeito fiscal, e a ausência do tenant está assertada em
 * `test/fleet-schema/tenant-safety.contract.ts` para não passar por esquecimento.
 *
 * Sem paginação de propósito: são nove linhas, e um cursor aqui seria encanamento para uma página.
 */
export class DrizzleVehicleReferenceRepository implements VehicleReferencePort {
  private readonly database: Database

  constructor(dependencies: { readonly database: Database }) {
    this.database = dependencies.database
  }

  async list(): Promise<readonly VehicleReference[]> {
    const records = await this.database
      .select({
        bodyType: vehicleVolumeReferences.bodyType,
        cargoHeightM: vehicleVolumeReferences.cargoHeightM,
        cargoLengthM: vehicleVolumeReferences.cargoLengthM,
        cargoWidthM: vehicleVolumeReferences.cargoWidthM,
        maxPayloadKg: vehicleVolumeReferences.maxPayloadKg,
        vehicleType: vehicleVolumeReferences.vehicleType,
      })
      .from(vehicleVolumeReferences)
      .orderBy(asc(vehicleVolumeReferences.vehicleType), asc(vehicleVolumeReferences.bodyType))

    return records.map((record) => ({
      ...record,
      vehicleType: record.vehicleType as VehicleType | '',
    }))
  }
}
