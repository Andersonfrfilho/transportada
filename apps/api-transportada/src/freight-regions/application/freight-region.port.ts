/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriverRegionScope,
  FreightRegionStatus,
} from '../../database/freight-region.schema.js'
import type { FreightVehicleClass } from '../../shared/freight-class.constant.js'

export type FreightRegionCity = {
  readonly city: string
  readonly state: string
}

/** O que a transportadora paga ao motorista por viagem na rota, por classe de veículo. */
export type FreightRegionDriverRate = {
  readonly driverAmount: string
  readonly freightClass: FreightVehicleClass
}

export type FreightRegionInput = {
  readonly cities: readonly FreightRegionCity[]
  readonly code: string
  readonly name: string
  readonly rates: readonly FreightRegionDriverRate[]
}

export type FreightRegion = FreightRegionInput & {
  readonly createdAt: string
  readonly id: string
  readonly status: FreightRegionStatus
  readonly updatedAt: string
  readonly version: string
  /** Derivada do código impresso, nunca digitada — ver `region-coverage.policy.ts`. */
  readonly zone: number
}

export type FreightRegionFilters = {
  readonly cityContains?: string
  readonly statusEq?: FreightRegionStatus
}

export type FreightRegionPage = {
  readonly items: readonly FreightRegion[]
  readonly nextCursor: string | null
}

export type FreightRegionRepositoryPort = {
  create(input: {
    readonly companyId: string
    readonly region: FreightRegionInput
  }): Promise<FreightRegion>
  delete(input: { readonly companyId: string; readonly regionId: string }): Promise<boolean>
  findById(input: {
    readonly companyId: string
    readonly regionId: string
  }): Promise<FreightRegion | null>
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FreightRegionFilters
    readonly limit: number
  }): Promise<FreightRegionPage>
  update(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly region: FreightRegionInput
    readonly regionId: string
    readonly status: FreightRegionStatus
  }): Promise<FreightRegion | null>
}

/** `region` cobre a zona e as abaixo dela; `city` cobre uma cidade só, dentro da mesma rota. */
export type FleetDriverRegionEntry = {
  readonly city: string
  readonly regionId: string
  readonly scope: FleetDriverRegionScope
  readonly state: string
}

export type FleetDriverRegionCoverage = FleetDriverRegionEntry & {
  readonly code: string
  readonly name: string
  readonly zone: number
}

export type FleetDriverRegionRepositoryPort = {
  listByDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly FleetDriverRegionCoverage[]>
  listExistingRegionIds(input: {
    readonly companyId: string
    readonly regionIds: readonly string[]
  }): Promise<readonly string[]>
  replaceForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly entries: readonly FleetDriverRegionEntry[]
  }): Promise<readonly FleetDriverRegionCoverage[]>
}

export type FreightRegionCompanyContext = {
  readonly companyId: string
  readonly userId: string
}
