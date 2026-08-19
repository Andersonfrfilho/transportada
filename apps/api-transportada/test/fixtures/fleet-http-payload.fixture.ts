/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriver,
  FleetDriverPage,
  FleetDriverVehicleAssignment,
  FleetDriverVehicleLink,
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
export const DRIVER_OWNED_VEHICLE_ID = '00000000-0000-4000-8000-000000000913'
export const LINK_ID = '00000000-0000-4000-8000-000000000914'
export const OWNED_LINK_ID = '00000000-0000-4000-8000-000000000915'

export const CREATE_VEHICLE_BODY = {
  acquisitionAmount: '0.0000',
  annualInsuranceAmount: '0.0000',
  annualVehicleTaxAmount: '0.0000',
  averageConsumption: '0.00',
  axleCount: 0,
  bodyType: '00',
  brand: '',
  capacityCubicMeters: '90.00',
  capacityKilograms: '27000.00',
  color: '',
  fleetNumber: '',
  fuelType: 'diesel-s10',
  model: '',
  modelYear: 0,
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.0000',
  owner: null,
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  state: 'SP',
  tareWeightKilograms: '8000.00',
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
  linkedTaxId: '',
  membershipId: null,
  name: 'Jose da Silva',
  phone: '11988887777',
  taxId: '12345678901',
} as const

export const LINKED_COMPANY_TAX_ID = '12345678000195'

export const UPDATE_DRIVER_BODY = {
  ...CREATE_DRIVER_BODY,
  expectedVersion: '1',
  membershipId: MEMBERSHIP_ID,
  status: 'active',
} as const

export const VEHICLE: FleetVehicle = {
  ...CREATE_VEHICLE_BODY,
  costPerKilometer: null,
  costPerKilometerBreakdown: null,
  costsUpdatedAt: null,
  createdAt: '2026-07-28T12:00:00.000Z',
  fuelPrice: null,
  id: VEHICLE_ID,
  monthlyFixedCost: null,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
}

/** Consumo e outros custos informados, com preço efetivo do diesel na UF da empresa. */
export const DERIVED_COST_VEHICLE: FleetVehicle = {
  ...VEHICLE,
  averageConsumption: '12.00',
  costPerKilometer: '0.9567',
  costPerKilometerBreakdown: { fuel: '0.4567', otherCosts: '0.5000' },
  fuelPrice: {
    pricePerUnit: '5.4800',
    source: 'manual',
    unit: 'litre',
    weekEndingOn: '2026-08-08',
  },
  otherCostsPerKilometer: '0.5000',
}

/** Sem consumo informado: a parcela de combustível não existe e é omitida da composição. */
export const OTHER_COSTS_ONLY_VEHICLE: FleetVehicle = {
  ...VEHICLE,
  costPerKilometer: '0.5000',
  costPerKilometerBreakdown: { otherCosts: '0.5000' },
  otherCostsPerKilometer: '0.5000',
}

export const DRIVER: FleetDriver = {
  ...CREATE_DRIVER_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: DRIVER_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
}

export const DRIVER_OWNED_VEHICLE: FleetVehicle = {
  ...VEHICLE,
  id: DRIVER_OWNED_VEHICLE_ID,
  owner: {
    name: 'Jose da Silva Transportes',
    rntrc: '12345678',
    state: 'SP',
    taxId: LINKED_COMPANY_TAX_ID,
    taxRegime: '1',
  },
  ownership: 'aggregate',
  plate: 'QRS4E56',
}

export const DRIVER_VEHICLE_LINKS: readonly FleetDriverVehicleLink[] = [
  { assignedAt: '2026-07-28T12:00:00.000Z', id: LINK_ID, vehicle: VEHICLE },
  { assignedAt: '2026-07-29T12:00:00.000Z', id: OWNED_LINK_ID, vehicle: DRIVER_OWNED_VEHICLE },
]

export const DRIVER_VEHICLE_ASSIGNMENTS: readonly FleetDriverVehicleAssignment[] = [
  { ...DRIVER_VEHICLE_LINKS[0]!, ownedByDriver: false },
  { ...DRIVER_VEHICLE_LINKS[1]!, ownedByDriver: true },
]

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
  readonly details?: readonly { readonly field: string; readonly message: string }[]
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: {
      readonly code: string
      readonly details?: readonly { readonly field: string; readonly message: string }[]
      readonly message: string
    }
  }
  return payload.error
}

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}
