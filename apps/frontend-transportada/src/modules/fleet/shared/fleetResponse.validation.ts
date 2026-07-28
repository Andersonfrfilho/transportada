/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_DETAIL_KEYS, FLEET_ERROR, OWNER_KEYS, VEHICLE_DETAIL_KEYS } from './fleet.constant'
import type {
  FleetDriverDetail,
  FleetDriverPage,
  FleetVehicleDetail,
  FleetVehiclePage,
} from './fleet.types'
import {
  FLEET_ENUMS,
  hasEveryKey,
  hasOnlyKeys,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
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

function isVehicle(value: unknown): value is FleetVehicleDetail {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, VEHICLE_DETAIL_KEYS) || !hasEveryKey(value, VEHICLE_DETAIL_KEYS)) {
    return false
  }
  return (
    isOneOf(value.bodyType, FLEET_ENUMS.bodyType) &&
    isUnsignedIntegerString(value.capacityCubicMeters) &&
    isUnsignedIntegerString(value.capacityKilograms) &&
    isString(value.createdAt) &&
    isString(value.id) &&
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
    isNullableString(value.membershipId) &&
    isString(value.name) &&
    isString(value.phone) &&
    isOneOf(value.status, FLEET_ENUMS.driverStatus) &&
    isString(value.taxId) &&
    isString(value.updatedAt) &&
    isUnsignedIntegerString(value.version)
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
    driverFromApi,
    driverListFromApi(input: unknown): FleetDriverPage {
      return readPage(input, driverFromApi)
    },
    vehicleFromApi,
    vehicleListFromApi(input: unknown): FleetVehiclePage {
      return readPage(input, vehicleFromApi)
    },
  }
}
