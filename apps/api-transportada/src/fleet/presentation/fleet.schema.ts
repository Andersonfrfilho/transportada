/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  hasFilter,
  invalidRequest,
  optionalFilter,
  parseBody,
  parseContains,
  parseOption,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import {
  FLEET_DRIVER_STATUSES,
  FLEET_VEHICLE_ROLES,
  FLEET_VEHICLE_STATUSES,
} from '../../database/fleet.schema.js'
import type { FleetDriverFilters, FleetVehicleFilters } from '../application/fleet.port.js'
import type { FleetDriverProfile } from '../domain/fleet-driver-profile.constant.js'
import {
  createDriverSchema,
  createVehicleSchema,
  driverAvailabilitySchema,
  type DriverAvailabilityQuery,
  replaceDriverVehiclesSchema,
  updateDriverSchema,
  updateVehicleSchema,
  type FleetDriverFields,
  type FleetVehicleFields,
} from './fleet-request.schema.js'

const DRIVER_AVAILABILITY_QUERY_KEYS = new Set(['driverId', 'email', 'licenseNumber', 'taxId'])
const DRIVER_QUERY_KEYS = new Set(['cursor', 'limit', 'nameContains', 'statusEq'])
const VEHICLE_QUERY_KEYS = new Set(['cursor', 'limit', 'plateContains', 'roleEq', 'statusEq'])

type Listing<TFilters> = {
  readonly cursor: string | null
  readonly filters?: TFilters
  readonly limit: number
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export type UpdateVehicleBody = FleetVehicleFields & {
  readonly expectedVersion: string
  readonly status: (typeof FLEET_VEHICLE_STATUSES)[number]
}

export type UpdateDriverBody = FleetDriverFields & {
  readonly expectedVersion: string
  readonly status: (typeof FLEET_DRIVER_STATUSES)[number]
}

export async function parseCreateVehicleRequest(request: Request): Promise<FleetVehicleFields> {
  return parseBody(createVehicleSchema, request)
}

export async function parseUpdateVehicleRequest(request: Request): Promise<UpdateVehicleBody> {
  return parseBody(updateVehicleSchema, request)
}

/** O vínculo não vem do corpo, e o perfil vem: é o papel do usuário que a criação abre. */
export type CreateDriverBody = Omit<FleetDriverFields, 'membershipId'> & {
  readonly profile: FleetDriverProfile
}

export async function parseCreateDriverRequest(request: Request): Promise<CreateDriverBody> {
  return parseBody(createDriverSchema, request)
}

export async function parseUpdateDriverRequest(request: Request): Promise<UpdateDriverBody> {
  return parseBody(updateDriverSchema, request)
}

export type { DriverAvailabilityQuery }

export function parseDriverAvailability(url: URL): DriverAvailabilityQuery {
  const parameters = readListQuery(url, DRIVER_AVAILABILITY_QUERY_KEYS)
  const parsed = driverAvailabilitySchema.safeParse({
    driverId: parameters.get('driverId'),
    email: parameters.get('email') ?? '',
    licenseNumber: parameters.get('licenseNumber') ?? '',
    taxId: parameters.get('taxId') ?? '',
  })
  if (!parsed.success) throw invalidRequest()
  return parsed.data
}

export async function parseReplaceDriverVehiclesRequest(
  request: Request,
): Promise<{ readonly vehicleIds: readonly string[] }> {
  return parseBody(replaceDriverVehiclesSchema, request)
}

export function parseVehicleList(url: URL): Listing<FleetVehicleFilters> {
  const parameters = readListQuery(url, VEHICLE_QUERY_KEYS)
  const filters: FleetVehicleFilters = {
    ...optionalFilter('plateContains', parseContains(parameters.get('plateContains'))),
    ...optionalFilter('roleEq', parseOption(parameters.get('roleEq'), FLEET_VEHICLE_ROLES)),
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), FLEET_VEHICLE_STATUSES)),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}

export function parseDriverList(url: URL): Listing<FleetDriverFilters> {
  const parameters = readListQuery(url, DRIVER_QUERY_KEYS)
  const filters: FleetDriverFilters = {
    ...optionalFilter('nameContains', parseContains(parameters.get('nameContains'))),
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), FLEET_DRIVER_STATUSES)),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}
