/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { invalidRequest, readListQuery } from '../../http/request-parsing.service.js'
import { FLEET_VEHICLE_ROLES } from '../../database/fleet.schema.js'
import { VEHICLE_TYPES } from '../../shared/vehicle-type.constant.js'
import type {
  ListVehicleCatalogBrandsInput,
  ListVehicleCatalogModelsInput,
} from '../application/fleet-vehicle-catalog.port.js'

const VEHICLE_CATALOG_QUERY_KEYS = new Set(['brand', 'role', 'vehicleType'])

export function parseVehicleCatalogBrandsQuery(url: URL): ListVehicleCatalogBrandsInput {
  const parameters = readListQuery(url, VEHICLE_CATALOG_QUERY_KEYS)
  return {
    role: parseRole(parameters.get('role')),
    vehicleType: parseVehicleType(parameters.get('vehicleType')),
  }
}

export function parseVehicleCatalogModelsQuery(url: URL): ListVehicleCatalogModelsInput {
  const parameters = readListQuery(url, VEHICLE_CATALOG_QUERY_KEYS)
  const brand = (parameters.get('brand') ?? '').trim()
  if (brand === '') throw invalidRequest()

  return {
    brand,
    role: parseRole(parameters.get('role')),
    vehicleType: parseVehicleType(parameters.get('vehicleType')),
  }
}

function parseRole(value: string | null): ListVehicleCatalogBrandsInput['role'] {
  const option = FLEET_VEHICLE_ROLES.find((candidate) => candidate === value)
  if (option === undefined) throw invalidRequest()
  return option
}

function parseVehicleType(value: string | null): ListVehicleCatalogBrandsInput['vehicleType'] {
  if (value === null || value === '') return ''
  const option = VEHICLE_TYPES.find((candidate) => candidate === value)
  if (option === undefined) throw invalidRequest()
  return option
}
