/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_DETAIL_KEYS,
  DRIVER_VEHICLE_LINK_KEYS,
  FLEET_CAPABILITY_KEYS,
  FLEET_ERROR,
  OWNER_KEYS,
  VEHICLE_COST_BREAKDOWN_KEYS,
  VEHICLE_DETAIL_KEYS,
  VEHICLE_FUEL_PRICE_KEYS,
} from './fleet.constant'
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
    isUnsignedIntegerString(value.capacityCubicMeters) &&
    isUnsignedIntegerString(value.capacityKilograms) &&
    isString(value.color) &&
    isNullableDecimalString(value.costPerKilometer) &&
    isCostBreakdown(value.costPerKilometerBreakdown) &&
    isNullableString(value.costsUpdatedAt) &&
    isString(value.createdAt) &&
    isString(value.fleetNumber) &&
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
    isUnsignedIntegerString(value.tareWeightKilograms) &&
    isString(value.updatedAt) &&
    isUnsignedIntegerString(value.version) &&
    (value.wheelType === '' || isOneOf(value.wheelType, FLEET_ENUMS.wheelType))
  )
}

function isDriver(value: unknown): value is FleetDriverDetail {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, DRIVER_DETAIL_KEYS) || !hasEveryKey(value, DRIVER_DETAIL_KEYS)) {
    return false
  }
  return (
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
    driverVehicleListFromApi(input: unknown): readonly FleetDriverVehicleLink[] {
      if (!isRecord(input) || !Array.isArray(input.data)) throw invalid()
      return input.data.map((item) => {
        if (!isDriverVehicleLink(item)) throw invalid()
        return item
      })
    },
    vehicleFromApi,
    vehicleListFromApi(input: unknown): FleetVehiclePage {
      return readPage(input, vehicleFromApi)
    },
  }
}
