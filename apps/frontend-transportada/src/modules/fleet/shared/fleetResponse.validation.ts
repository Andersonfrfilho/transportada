/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_ADDRESS_KEYS,
  DRIVER_COVERAGE_KEYS,
  DRIVER_DETAIL_KEYS,
  DRIVER_VEHICLE_LINK_KEYS,
  FLEET_CAPABILITY_KEYS,
  FLEET_ERROR,
  FREIGHT_REGION_CITY_KEYS,
  FREIGHT_REGION_IMPORT_SUMMARY_KEYS,
  FREIGHT_REGION_KEYS,
  FREIGHT_REGION_RATE_KEYS,
  OWNER_KEYS,
  VEHICLE_COST_BREAKDOWN_KEYS,
  VEHICLE_DETAIL_KEYS,
  VEHICLE_FUEL_PRICE_KEYS,
} from './fleet.constant'
import { FREIGHT_VEHICLE_CLASSES } from '../../shared/freightClass.constant'
import { DRIVER_COVERAGE_SCOPES, type FleetDriverCoverage } from './driverCoverage.service'
import type {
  FreightRegion,
  FreightRegionImportSummary,
  FreightRegionPage,
} from './freightRegion.types'
import { FREIGHT_REGION_STATUS } from './freightRegion.types'
import type {
  FleetCapabilities,
  FleetDriverDetail,
  FleetDriverPage,
  FleetDriverVehicleLink,
  FleetVehicleCatalogResult,
  FleetVehicleDetail,
  FleetVehiclePage,
} from './fleet.types'
import { FLEET_VEHICLE_CATALOG_SOURCE } from './fleet.types'
import {
  FLEET_ENUMS,
  hasEveryKey,
  hasOnlyKeys,
  isDecimalString,
  isNullableDecimalString,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
  isUnsignedIntegerNumber,
  isUnsignedIntegerString,
} from './fleetGuards.validation'

function invalid(): Error {
  return new Error(FLEET_ERROR.RESPONSE_INVALID)
}

function isOwner(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, OWNER_KEYS) &&
    hasEveryKey(value, OWNER_KEYS) &&
    isString(value.name) &&
    isString(value.rntrc) &&
    isString(value.state) &&
    isString(value.taxId) &&
    isOneOf(value.taxRegime, FLEET_ENUMS.taxRegime)
  )
}

/** Parcela ausente e parcela zerada dizem coisas diferentes: a chave só existe quando há custo. */
function isCostBreakdown(value: unknown): boolean {
  if (value === null) return true
  if (!isRecord(value) || !hasOnlyKeys(value, VEHICLE_COST_BREAKDOWN_KEYS)) return false

  return VEHICLE_COST_BREAKDOWN_KEYS.every(
    (key) => value[key] === undefined || isDecimalString(value[key]),
  )
}

function isFuelPrice(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, VEHICLE_FUEL_PRICE_KEYS) &&
    hasEveryKey(value, VEHICLE_FUEL_PRICE_KEYS) &&
    isDecimalString(value.pricePerUnit) &&
    isOneOf(value.source, FLEET_ENUMS.fuelPriceSource) &&
    isOneOf(value.unit, FLEET_ENUMS.fuelUnit) &&
    isNullableString(value.weekEndingOn)
  )
}

function isRegionCity(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FREIGHT_REGION_CITY_KEYS) &&
    hasEveryKey(value, FREIGHT_REGION_CITY_KEYS) &&
    isString(value.city) &&
    isString(value.state)
  )
}

/** O valor pago ao motorista chega como decimal string; número binário aqui é resposta inválida. */
function isRegionRate(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FREIGHT_REGION_RATE_KEYS) &&
    hasEveryKey(value, FREIGHT_REGION_RATE_KEYS) &&
    isDecimalString(value.driverAmount) &&
    isOneOf(value.freightClass, FREIGHT_VEHICLE_CLASSES)
  )
}

function isFreightRegion(value: unknown): value is FreightRegion {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, FREIGHT_REGION_KEYS) || !hasEveryKey(value, FREIGHT_REGION_KEYS)) {
    return false
  }
  return (
    Array.isArray(value.cities) &&
    value.cities.every(isRegionCity) &&
    isString(value.code) &&
    isString(value.createdAt) &&
    isString(value.id) &&
    isString(value.name) &&
    Array.isArray(value.rates) &&
    value.rates.every(isRegionRate) &&
    isOneOf(value.status, FREIGHT_REGION_STATUS) &&
    isString(value.updatedAt) &&
    isUnsignedIntegerString(value.version) &&
    isUnsignedIntegerNumber(value.zone)
  )
}

function isImportSummary(value: unknown): value is FreightRegionImportSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FREIGHT_REGION_IMPORT_SUMMARY_KEYS) &&
    hasEveryKey(value, FREIGHT_REGION_IMPORT_SUMMARY_KEYS) &&
    isUnsignedIntegerNumber(value.created) &&
    isUnsignedIntegerNumber(value.deactivated) &&
    isUnsignedIntegerNumber(value.updated)
  )
}

function isVehicle(value: unknown): value is FleetVehicleDetail {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, VEHICLE_DETAIL_KEYS) || !hasEveryKey(value, VEHICLE_DETAIL_KEYS)) {
    return false
  }
  return (
    isDecimalString(value.acquisitionAmount) &&
    isDecimalString(value.annualInsuranceAmount) &&
    isDecimalString(value.annualVehicleTaxAmount) &&
    isDecimalString(value.averageConsumption) &&
    isUnsignedIntegerNumber(value.axleCount) &&
    isOneOf(value.bodyType, FLEET_ENUMS.bodyType) &&
    isString(value.brand) &&
    isDecimalString(value.capacityCubicMeters) &&
    isDecimalString(value.capacityKilograms) &&
    isString(value.color) &&
    isNullableDecimalString(value.costPerKilometer) &&
    isCostBreakdown(value.costPerKilometerBreakdown) &&
    isNullableString(value.costsUpdatedAt) &&
    isString(value.createdAt) &&
    isString(value.fleetNumber) &&
    (value.freightClass === '' || isOneOf(value.freightClass, FREIGHT_VEHICLE_CLASSES)) &&
    (value.fuelPrice === null || isFuelPrice(value.fuelPrice)) &&
    isOneOf(value.fuelType, FLEET_ENUMS.fuelType) &&
    isString(value.id) &&
    isString(value.model) &&
    isUnsignedIntegerNumber(value.modelYear) &&
    isNullableDecimalString(value.monthlyFixedCost) &&
    isDecimalString(value.monthlyInstallmentAmount) &&
    (value.owner === null || isOwner(value.owner)) &&
    isOneOf(value.ownership, FLEET_ENUMS.ownership) &&
    isString(value.plate) &&
    isString(value.renavam) &&
    isOneOf(value.role, FLEET_ENUMS.role) &&
    isString(value.state) &&
    isOneOf(value.status, FLEET_ENUMS.vehicleStatus) &&
    isDecimalString(value.tareWeightKilograms) &&
    isString(value.updatedAt) &&
    isUnsignedIntegerString(value.version) &&
    (value.wheelType === '' || isOneOf(value.wheelType, FLEET_ENUMS.wheelType))
  )
}

function isDriverAddress(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, DRIVER_ADDRESS_KEYS) &&
    hasEveryKey(value, DRIVER_ADDRESS_KEYS) &&
    DRIVER_ADDRESS_KEYS.every((key) => isString(value[key]))
  )
}

function isDriver(value: unknown): value is FleetDriverDetail {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, DRIVER_DETAIL_KEYS) || !hasEveryKey(value, DRIVER_DETAIL_KEYS)) {
    return false
  }
  return (
    isDriverAddress(value.address) &&
    isNullableString(value.birthDate) &&
    isNullableString(value.licenseExpiresAt) &&
    isString(value.createdAt) &&
    isString(value.id) &&
    isString(value.licenseNumber) &&
    isString(value.linkedTaxId) &&
    isNullableString(value.membershipId) &&
    isString(value.name) &&
    isString(value.phone) &&
    isOneOf(value.status, FLEET_ENUMS.driverStatus) &&
    isString(value.taxId) &&
    isString(value.updatedAt) &&
    isUnsignedIntegerString(value.version)
  )
}

function isDriverVehicleLink(value: unknown): value is FleetDriverVehicleLink {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, DRIVER_VEHICLE_LINK_KEYS) ||
    !hasEveryKey(value, DRIVER_VEHICLE_LINK_KEYS)
  ) {
    return false
  }
  return (
    isString(value.assignedAt) &&
    isString(value.id) &&
    typeof value.ownedByDriver === 'boolean' &&
    isVehicle(value.vehicle)
  )
}

/** Zona não carrega cidade e cidade sem cidade não cobre nada — as duas metades do CHECK. */
function isDriverCoverage(value: unknown): value is FleetDriverCoverage {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, DRIVER_COVERAGE_KEYS) || !hasEveryKey(value, DRIVER_COVERAGE_KEYS)) {
    return false
  }
  const isCityScope = value.scope === 'city'
  return (
    (isCityScope ? isString(value.city) : value.city === null) &&
    (isCityScope ? isString(value.state) : value.state === null) &&
    isString(value.code) &&
    isString(value.name) &&
    isString(value.regionId) &&
    isOneOf(value.scope, DRIVER_COVERAGE_SCOPES) &&
    isUnsignedIntegerNumber(value.zone)
  )
}

function isCapabilities(value: unknown): value is FleetCapabilities {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, FLEET_CAPABILITY_KEYS) || !hasEveryKey(value, FLEET_CAPABILITY_KEYS)) {
    return false
  }
  return typeof value.vehicleCatalog === 'boolean'
}

function isCatalogOption(value: unknown): boolean {
  return isRecord(value) && isString(value.code) && isString(value.name)
}

function isCatalogResult(value: unknown): value is FleetVehicleCatalogResult {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isCatalogOption) &&
    isOneOf(value.source, FLEET_VEHICLE_CATALOG_SOURCE)
  )
}

function readPage<TItem>(
  input: unknown,
  itemFromApi: (item: unknown) => TItem,
): {
  readonly items: readonly TItem[]
  readonly nextCursor: null | string
} {
  if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) throw invalid()
  const nextCursor = input.page.nextCursor
  if (!isNullableString(nextCursor)) throw invalid()
  return { items: input.data.map(itemFromApi), nextCursor }
}

export function createFleetResponseAdapters() {
  function vehicleFromApi(input: unknown): FleetVehicleDetail {
    if (!isVehicle(input)) throw invalid()
    return input
  }

  function driverFromApi(input: unknown): FleetDriverDetail {
    if (!isDriver(input)) throw invalid()
    return input
  }

  return {
    capabilitiesFromApi(input: unknown): FleetCapabilities {
      if (!isCapabilities(input)) throw invalid()
      return input
    },
    catalogResultFromApi(input: unknown): FleetVehicleCatalogResult {
      if (!isCatalogResult(input)) throw invalid()
      return input
    },
    driverFromApi,
    driverListFromApi(input: unknown): FleetDriverPage {
      return readPage(input, driverFromApi)
    },
    driverCoverageListFromApi(input: unknown): readonly FleetDriverCoverage[] {
      if (!isRecord(input) || !Array.isArray(input.data)) throw invalid()
      return input.data.map((item) => {
        if (!isDriverCoverage(item)) throw invalid()
        return item
      })
    },
    driverVehicleListFromApi(input: unknown): readonly FleetDriverVehicleLink[] {
      if (!isRecord(input) || !Array.isArray(input.data)) throw invalid()
      return input.data.map((item) => {
        if (!isDriverVehicleLink(item)) throw invalid()
        return item
      })
    },
    freightRegionFromApi(input: unknown): FreightRegion {
      if (!isFreightRegion(input)) throw invalid()
      return input
    },
    freightRegionImportSummaryFromApi(input: unknown): FreightRegionImportSummary {
      if (!isImportSummary(input)) throw invalid()
      return input
    },
    freightRegionListFromApi(input: unknown): FreightRegionPage {
      return readPage(input, (item) => {
        if (!isFreightRegion(item)) throw invalid()
        return item
      })
    },
    vehicleFromApi,
    vehicleListFromApi(input: unknown): FleetVehiclePage {
      return readPage(input, vehicleFromApi)
    },
  }
}
