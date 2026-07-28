/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriver,
  FleetDriverPage,
  FleetVehicle,
  FleetVehiclePage,
} from '../../src/fleet/application/fleet.port'

export const FLEET_VEHICLES_PATH = '/fleet/vehicles'
export const FLEET_DRIVERS_PATH = '/fleet/drivers'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const CORRELATION_ID = 'fleet-http-correlation'
export const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000902'

export const CREATE_VEHICLE_BODY = {
  bodyType: '00',
  capacityCubicMeters: '90',
  capacityKilograms: '27000',
  owner: null,
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  state: 'SP',
  tareWeightKilograms: '8000',
  wheelType: '03',
} as const

export const CREATE_TRAILER_BODY = {
  ...CREATE_VEHICLE_BODY,
  bodyType: '01',
  plate: 'XYZ9A88',
  role: 'trailer',
  wheelType: '',
} as const

export const THIRD_PARTY_OWNER_BODY = {
  name: 'Agregado Transportes Ltda',
  rntrc: '12345678',
  state: 'MG',
  taxId: '12345678000195',
  taxRegime: '1',
} as const

export const UPDATE_VEHICLE_BODY = {
  ...CREATE_VEHICLE_BODY,
  expectedVersion: '1',
  status: 'active',
} as const

export const CREATE_DRIVER_BODY = {
  licenseNumber: '12345678901',
  membershipId: null,
  name: 'Jose da Silva',
  phone: '11988887777',
  taxId: '12345678901',
} as const

export const UPDATE_DRIVER_BODY = {
  ...CREATE_DRIVER_BODY,
  expectedVersion: '1',
  membershipId: MEMBERSHIP_ID,
  status: 'active',
} as const

export const VEHICLE: FleetVehicle = {
  ...CREATE_VEHICLE_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: VEHICLE_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
}

export const DRIVER: FleetDriver = {
  ...CREATE_DRIVER_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: DRIVER_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
}

export const VEHICLE_PAGE: FleetVehiclePage = { items: [VEHICLE], nextCursor: null }

export const DRIVER_PAGE: FleetDriverPage = { items: [DRIVER], nextCursor: null }

export function jsonRequest(input: {
  readonly body?: unknown
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
}

export async function responseApiError(response: Response): Promise<{
  readonly code: string
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
  return payload.error
}

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}
