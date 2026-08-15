/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriverStatus,
  FleetVehicleOwnership,
  FleetVehicleRole,
  FleetVehicleStatus,
  MdfeBodyType,
  MdfeOwnerTaxRegime,
  MdfeWheelType,
} from '../../database/fleet.schema.js'
import type { FuelProduct, FuelUnit } from '../../shared/fuel.constant.js'
import type {
  EffectiveFuelPrice,
  FuelPriceSource,
} from '../../companies/domain/fuel-price.policy.js'
import type { CostPerKilometerBreakdown } from '../domain/vehicle-cost.policy.js'

export type FleetCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type FleetVehicleOwner = {
  readonly name: string
  readonly rntrc: string
  readonly state: string
  readonly taxId: string
  readonly taxRegime: MdfeOwnerTaxRegime
}

export type FleetVehicleInput = {
  readonly acquisitionAmount: string
  readonly annualInsuranceAmount: string
  readonly annualVehicleTaxAmount: string
  readonly averageConsumption: string
  readonly axleCount: number
  readonly bodyType: MdfeBodyType
  readonly brand: string
  readonly capacityCubicMeters: string
  readonly capacityKilograms: string
  readonly color: string
  readonly fleetNumber: string
  readonly fuelType: FuelProduct
  readonly model: string
  readonly modelYear: number
  readonly monthlyInstallmentAmount: string
  readonly otherCostsPerKilometer: string
  readonly owner: FleetVehicleOwner | null
  readonly ownership: FleetVehicleOwnership
  readonly plate: string
  readonly renavam: string
  readonly role: FleetVehicleRole
  readonly state: string
  readonly tareWeightKilograms: string
  readonly wheelType: MdfeWheelType | ''
}

/** O preço que sustentou a derivação, para a tela explicar o número em vez de só exibi-lo. */
export type FleetVehicleFuelPrice = {
  readonly pricePerUnit: string
  readonly source: FuelPriceSource
  readonly unit: FuelUnit
  readonly weekEndingOn: string | null
}

export type FleetVehicle = FleetVehicleInput & {
  readonly costPerKilometer: string | null
  readonly costPerKilometerBreakdown: CostPerKilometerBreakdown | null
  readonly costsUpdatedAt: string | null
  readonly createdAt: string
  readonly fuelPrice: FleetVehicleFuelPrice | null
  readonly id: string
  readonly monthlyFixedCost: string | null
  readonly status: FleetVehicleStatus
  readonly updatedAt: string
  readonly version: string
}

/** A tabela inteira da empresa de uma vez: resolver preço por veículo seria N+1 na listagem. */
export type FleetFuelPricePort = {
  resolveByProduct(input: {
    readonly companyId: string
  }): Promise<ReadonlyMap<FuelProduct, EffectiveFuelPrice>>
}

export type FleetVehicleFilters = {
  readonly plateContains?: string
  readonly roleEq?: FleetVehicleRole
  readonly statusEq?: FleetVehicleStatus
}

export type FleetVehiclePage = {
  readonly items: readonly FleetVehicle[]
  readonly nextCursor: string | null
}

export type FleetDriverInput = {
  readonly licenseNumber: string
  /** CNPJ da empresa do motorista autônomo; vazio quando ele dirige só como pessoa física. */
  readonly linkedTaxId: string
  readonly membershipId: string | null
  readonly name: string
  readonly phone: string
  readonly taxId: string
}

export type FleetDriver = FleetDriverInput & {
  readonly createdAt: string
  readonly id: string
  readonly status: FleetDriverStatus
  readonly updatedAt: string
  readonly version: string
}

export type FleetDriverFilters = {
  readonly nameContains?: string
  readonly statusEq?: FleetDriverStatus
}

export type FleetDriverPage = {
  readonly items: readonly FleetDriver[]
  readonly nextCursor: string | null
}

export type FleetDriverVehicleLink = {
  readonly assignedAt: string
  readonly id: string
  readonly vehicle: FleetVehicle
}

/** O veículo é do próprio motorista quando o dono cadastrado é o CPF dele ou o CNPJ vinculado. */
export type FleetDriverVehicleAssignment = FleetDriverVehicleLink & {
  readonly ownedByDriver: boolean
}

export type FleetVehicleRepositoryPort = {
  create(input: {
    readonly companyId: string
    readonly vehicle: FleetVehicleInput
  }): Promise<FleetVehicle>
  findById(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<FleetVehicle | null>
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FleetVehicleFilters
    readonly limit: number
  }): Promise<FleetVehiclePage>
  update(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly status: FleetVehicleStatus
    readonly vehicle: FleetVehicleInput
    readonly vehicleId: string
  }): Promise<FleetVehicle | null>
}

export type FleetDriverVehicleRepositoryPort = {
  listByDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly FleetDriverVehicleLink[]>
  listExistingVehicleIds(input: {
    readonly companyId: string
    readonly vehicleIds: readonly string[]
  }): Promise<readonly string[]>
  replaceForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly vehicleIds: readonly string[]
  }): Promise<readonly FleetDriverVehicleLink[]>
}

export type FleetDriverRepositoryPort = {
  create(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
  }): Promise<FleetDriver>
  findById(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<FleetDriver | null>
  hasMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<boolean>
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FleetDriverFilters
    readonly limit: number
  }): Promise<FleetDriverPage>
  update(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
    readonly driverId: string
    readonly expectedVersion: string
    readonly status: FleetDriverStatus
  }): Promise<FleetDriver | null>
}
