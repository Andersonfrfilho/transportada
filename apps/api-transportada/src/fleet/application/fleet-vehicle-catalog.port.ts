/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleRole } from '../../database/fleet.schema.js'
import type { VehicleType } from '../../shared/vehicle-type.constant.js'

export type VehicleCatalogItem = {
  readonly label: string
  readonly value: string
}

export type VehicleCatalogSource = 'fipe' | 'none' | 'unavailable'

export type VehicleCatalogResult = {
  readonly items: readonly VehicleCatalogItem[]
  readonly source: VehicleCatalogSource
}

export type ListVehicleCatalogBrandsInput = {
  readonly role: FleetVehicleRole
  readonly vehicleType: VehicleType | ''
}

export type ListVehicleCatalogModelsInput = ListVehicleCatalogBrandsInput & {
  readonly brand: string
}

export type FleetVehicleCatalogPort = {
  listBrands(input: ListVehicleCatalogBrandsInput): Promise<VehicleCatalogResult>
  listModels(input: ListVehicleCatalogModelsInput): Promise<VehicleCatalogResult>
}
