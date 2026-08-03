/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_FLEET_CAPABILITIES_PATH,
  API_FLEET_DRIVERS_PATH,
  API_FLEET_VEHICLE_LOOKUP_PATH,
  API_FLEET_VEHICLES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ListFleetDriverVehiclesInput,
  ReplaceFleetDriverVehiclesInput,
} from '../application/fleet-driver-vehicles.use-case.js'
import type {
  CreateFleetDriverInput,
  ListFleetDriversInput,
  UpdateFleetDriverInput,
} from '../application/fleet-drivers.use-case.js'
import type {
  CreateFleetVehicleInput,
  ListFleetVehiclesInput,
  UpdateFleetVehicleInput,
} from '../application/fleet-vehicles.use-case.js'
import type { LookupFleetVehicleInput } from '../application/fleet-vehicle-lookup.use-case.js'
import type {
  FleetDriver,
  FleetDriverPage,
  FleetDriverVehicleAssignment,
  FleetVehicle,
  FleetVehicleLookup,
  FleetVehiclePage,
} from '../application/fleet.port.js'
import {
  parseCreateDriverRequest,
  parseCreateVehicleRequest,
  parseDriverList,
  parseReplaceDriverVehiclesRequest,
  parseUpdateDriverRequest,
  parseUpdateVehicleRequest,
  parseUuidPathIdentifier,
  parseVehicleList,
  parseVehicleLookupQuery,
} from './fleet.schema.js'

const DRIVER_PATH = `${API_FLEET_DRIVERS_PATH}/:id`
const DRIVER_VEHICLES_PATH = `${API_FLEET_DRIVERS_PATH}/:id/vehicles`
const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const VEHICLE_PATH = `${API_FLEET_VEHICLES_PATH}/:id`

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly createDriver: {
    execute(input: TenantInput<CreateFleetDriverInput>): Promise<FleetDriver>
  }
  readonly createVehicle: {
    execute(input: TenantInput<CreateFleetVehicleInput>): Promise<FleetVehicle>
  }
  readonly driverVehicles: {
    list(
      input: TenantInput<ListFleetDriverVehiclesInput>,
    ): Promise<readonly FleetDriverVehicleAssignment[]>
    replace(
      input: TenantInput<ReplaceFleetDriverVehiclesInput>,
    ): Promise<readonly FleetDriverVehicleAssignment[]>
  }
  readonly listDrivers: {
    execute(input: TenantInput<ListFleetDriversInput>): Promise<FleetDriverPage>
  }
  readonly listVehicles: {
    execute(input: TenantInput<ListFleetVehiclesInput>): Promise<FleetVehiclePage>
  }
  readonly updateDriver: {
    execute(input: TenantInput<UpdateFleetDriverInput>): Promise<FleetDriver>
  }
  readonly updateVehicle: {
    execute(input: TenantInput<UpdateFleetVehicleInput>): Promise<FleetVehicle>
  }
  readonly vehicleLookup: {
    isAvailable(): boolean
    lookup(input: TenantInput<LookupFleetVehicleInput>): Promise<FleetVehicleLookup | null>
  }
}

export function createFleetRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListFleetVehiclesInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listVehicles.execute({ context: context.scope, ...input })
        return pageResponse(page.items.map(serializeVehicle), page.nextCursor)
      },
      method: 'GET',
      parse: ({ request }) => parseVehicleList(new URL(request.url)),
      pathname: API_FLEET_VEHICLES_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<Omit<CreateFleetVehicleInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const vehicle = await dependencies.createVehicle.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeVehicle(vehicle) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return { correlationId, vehicle: await parseCreateVehicleRequest(request) }
      },
      pathname: API_FLEET_VEHICLES_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    // Consultar placa é serviço pago por consulta: fica atrás de fleet.manage, não de fleet.read
    defineRoute<Omit<LookupFleetVehicleInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const vehicle = await dependencies.vehicleLookup.lookup({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: vehicle }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseVehicleLookupQuery(new URL(request.url)),
      pathname: API_FLEET_VEHICLE_LOOKUP_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<Record<string, never>>({
      async handle(): Promise<Response> {
        const vehicleLookup = dependencies.vehicleLookup.isAvailable()
        return jsonResponse({ body: { data: { vehicleLookup } }, status: 200 })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_FLEET_CAPABILITIES_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<Omit<UpdateFleetVehicleInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const vehicle = await dependencies.updateVehicle.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeVehicle(vehicle) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        const { expectedVersion, status, ...vehicle } = await parseUpdateVehicleRequest(request)
        return {
          correlationId,
          expectedVersion,
          status,
          vehicle,
          vehicleId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: VEHICLE_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<Omit<ListFleetDriversInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listDrivers.execute({ context: context.scope, ...input })
        return pageResponse(page.items.map(serializeDriver), page.nextCursor)
      },
      method: 'GET',
      parse: ({ request }) => parseDriverList(new URL(request.url)),
      pathname: API_FLEET_DRIVERS_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<Omit<CreateFleetDriverInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const driver = await dependencies.createDriver.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeDriver(driver) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return { correlationId, driver: await parseCreateDriverRequest(request) }
      },
      pathname: API_FLEET_DRIVERS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<Omit<UpdateFleetDriverInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const driver = await dependencies.updateDriver.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeDriver(driver) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        const { expectedVersion, status, ...driver } = await parseUpdateDriverRequest(request)
        return {
          correlationId,
          driver,
          driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          expectedVersion,
          status,
        }
      },
      pathname: DRIVER_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<Omit<ListFleetDriverVehiclesInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const links = await dependencies.driverVehicles.list({ context: context.scope, ...input })
        return jsonResponse({ body: { data: links.map(serializeDriverVehicle) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: DRIVER_VEHICLES_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<Omit<ReplaceFleetDriverVehiclesInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const links = await dependencies.driverVehicles.replace({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: links.map(serializeDriverVehicle) }, status: 200 })
      },
      method: 'PUT',
      async parse({ correlationId, pathParameters, request }) {
        const { vehicleIds } = await parseReplaceDriverVehiclesRequest(request)
        return {
          correlationId,
          driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          vehicleIds,
        }
      },
      pathname: DRIVER_VEHICLES_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function pageResponse(data: readonly object[], nextCursor: string | null): Response {
  return jsonResponse({ body: { data, page: { nextCursor } }, status: 200 })
}

function serializeDriver(driver: FleetDriver): object {
  return {
    createdAt: driver.createdAt,
    id: driver.id,
    licenseNumber: driver.licenseNumber,
    linkedTaxId: driver.linkedTaxId,
    membershipId: driver.membershipId,
    name: driver.name,
    phone: driver.phone,
    status: driver.status,
    taxId: driver.taxId,
    updatedAt: driver.updatedAt,
    version: driver.version,
  }
}

function serializeDriverVehicle(link: FleetDriverVehicleAssignment): object {
  return {
    assignedAt: link.assignedAt,
    id: link.id,
    ownedByDriver: link.ownedByDriver,
    vehicle: serializeVehicle(link.vehicle),
  }
}

function serializeVehicle(vehicle: FleetVehicle): object {
  return {
    bodyType: vehicle.bodyType,
    capacityCubicMeters: vehicle.capacityCubicMeters,
    capacityKilograms: vehicle.capacityKilograms,
    createdAt: vehicle.createdAt,
    id: vehicle.id,
    owner: vehicle.owner === null ? null : { ...vehicle.owner },
    ownership: vehicle.ownership,
    plate: vehicle.plate,
    renavam: vehicle.renavam,
    role: vehicle.role,
    state: vehicle.state,
    status: vehicle.status,
    tareWeightKilograms: vehicle.tareWeightKilograms,
    updatedAt: vehicle.updatedAt,
    version: vehicle.version,
    wheelType: vehicle.wheelType,
  }
}
