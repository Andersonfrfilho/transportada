/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_MANAGE = 'fleet.manage'
export const FLEET_READ = 'fleet.read'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-28T12:00:00.000Z::00000000-0000-4000-8000-000000000911'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000902'
export const DRIVER_OWNED_VEHICLE_ID = '00000000-0000-4000-8000-000000000913'
export const LINK_ID = '00000000-0000-4000-8000-000000000921'
export const OWNED_LINK_ID = '00000000-0000-4000-8000-000000000922'

export type FleetVehicleOwnerContract = Readonly<{
  name: string
  rntrc: string
  state: string
  taxId: string
  taxRegime: '0' | '1' | '2'
}>

export type FleetVehicleBodyContract = Readonly<{
  bodyType: '00' | '01' | '02' | '03' | '04' | '05'
  capacityCubicMeters: string
  capacityKilograms: string
  owner: FleetVehicleOwnerContract | null
  ownership: 'aggregate' | 'own' | 'third_party'
  plate: string
  renavam: string
  role: 'traction' | 'trailer'
  state: string
  tareWeightKilograms: string
  wheelType: '' | '01' | '02' | '03' | '04' | '05' | '06'
}>

export type FleetVehicleDetailContract = FleetVehicleBodyContract &
  Readonly<{
    createdAt: string
    id: string
    status: 'active' | 'inactive'
    updatedAt: string
    version: string
  }>

export type FleetDriverBodyContract = Readonly<{
  licenseNumber: string
  linkedTaxId: string
  membershipId: null | string
  name: string
  phone: string
  taxId: string
}>

export type FleetDriverDetailContract = FleetDriverBodyContract &
  Readonly<{
    createdAt: string
    id: string
    status: 'active' | 'inactive'
    updatedAt: string
    version: string
  }>

export type FleetDriverVehicleContract = Readonly<{
  assignedAt: string
  id: string
  ownedByDriver: boolean
  vehicle: FleetVehicleDetailContract
}>

export type FleetVehiclePageContract = Readonly<{
  items: readonly FleetVehicleDetailContract[]
  nextCursor: null | string
}>

export type FleetDriverPageContract = Readonly<{
  items: readonly FleetDriverDetailContract[]
  nextCursor: null | string
}>

export const VEHICLE_OWNER = {
  name: 'Agregado Transportes Ltda',
  rntrc: '12345678',
  state: 'MG',
  taxId: '12345678000195',
  taxRegime: '1',
} as const satisfies FleetVehicleOwnerContract

export const VEHICLE_BODY = {
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
} as const satisfies FleetVehicleBodyContract

export const AGGREGATE_VEHICLE_BODY = {
  ...VEHICLE_BODY,
  bodyType: '01',
  owner: VEHICLE_OWNER,
  ownership: 'aggregate',
  plate: 'XYZ9A88',
  role: 'trailer',
  wheelType: '',
} as const satisfies FleetVehicleBodyContract

export const LINKED_COMPANY_TAX_ID = '12345678000195'

export const DRIVER_BODY = {
  licenseNumber: '12345678901',
  linkedTaxId: '',
  membershipId: null,
  name: 'Jose da Silva',
  phone: '11988887777',
  taxId: '12345678901',
} as const satisfies FleetDriverBodyContract

export const VEHICLE_DETAIL = {
  ...VEHICLE_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: VEHICLE_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
} as const satisfies FleetVehicleDetailContract

export const DRIVER_DETAIL = {
  ...DRIVER_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: DRIVER_ID,
  membershipId: MEMBERSHIP_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
} as const satisfies FleetDriverDetailContract

export const DRIVER_OWNED_VEHICLE = {
  ...AGGREGATE_VEHICLE_BODY,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: DRIVER_OWNED_VEHICLE_ID,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
} as const satisfies FleetVehicleDetailContract

export const DRIVER_VEHICLE_LINKS = [
  {
    assignedAt: '2026-07-28T12:00:00.000Z',
    id: LINK_ID,
    ownedByDriver: false,
    vehicle: VEHICLE_DETAIL,
  },
  {
    assignedAt: '2026-07-29T12:00:00.000Z',
    id: OWNED_LINK_ID,
    ownedByDriver: true,
    vehicle: DRIVER_OWNED_VEHICLE,
  },
] as const satisfies readonly FleetDriverVehicleContract[]

export type FleetVehicleLookupContract = Readonly<{
  brand: string
  capacityKilograms: string
  model: string
  modelYear: string
  ownerName: string
  ownerTaxId: string
  plate: string
  renavam: string
  state: string
  tareWeightKilograms: string
}>

export const VEHICLE_LOOKUP = {
  brand: 'Marca Sintetica',
  capacityKilograms: '27000',
  model: 'Modelo Sintetico',
  modelYear: '2020',
  ownerName: 'Agregado Transportes Ltda',
  ownerTaxId: '12345678000195',
  plate: 'ABC1D23',
  renavam: '12345678901',
  state: 'SP',
  tareWeightKilograms: '8000',
} as const satisfies FleetVehicleLookupContract

export const VEHICLE_PAGE = {
  items: [VEHICLE_DETAIL],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies FleetVehiclePageContract

export const DRIVER_PAGE = {
  items: [DRIVER_DETAIL],
  nextCursor: null,
} as const satisfies FleetDriverPageContract

export const EMPTY_VEHICLE_PAGE = {
  items: [],
  nextCursor: null,
} as const satisfies FleetVehiclePageContract

export const EMPTY_DRIVER_PAGE = {
  items: [],
  nextCursor: null,
} as const satisfies FleetDriverPageContract

export const VEHICLE_DRAFT_BODY = {
  bodyType: '00',
  capacityCubicMeters: '0',
  capacityKilograms: '0',
  owner: null,
  ownership: 'own',
  plate: '',
  renavam: '',
  role: 'traction',
  state: '',
  tareWeightKilograms: '0',
  wheelType: '01',
} as const satisfies FleetVehicleBodyContract

export const DRIVER_DRAFT_BODY = {
  licenseNumber: '',
  linkedTaxId: '',
  membershipId: null,
  name: '',
  phone: '',
  taxId: '',
} as const satisfies FleetDriverBodyContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
