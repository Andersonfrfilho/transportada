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

export type FleetVehicleFuelProductContract =
  | 'diesel-s10'
  | 'diesel-s500'
  | 'etanol-hidratado'
  | 'gasolina-comum'
  | 'gnv'

export type FleetVehicleCostFieldsContract = Readonly<{
  acquisitionAmount: string
  annualInsuranceAmount: string
  annualVehicleTaxAmount: string
  averageConsumption: string
  monthlyInstallmentAmount: string
  otherCostsPerKilometer: string
}>

export type FleetVehicleCostBreakdownContract = Readonly<{
  fuel?: string
  otherCosts?: string
}>

export type FleetVehicleFuelPriceContract = Readonly<{
  pricePerUnit: string
  source: 'anp' | 'manual'
  unit: 'cubic-metre' | 'litre'
  weekEndingOn: null | string
}>

export type FleetVehicleBodyContract = FleetVehicleCostFieldsContract &
  Readonly<{
    axleCount: number
    bodyType: '00' | '01' | '02' | '03' | '04' | '05'
    brand: string
    capacityCubicMeters: string
    capacityKilograms: string
    color: string
    fleetNumber: string
    fuelType: FleetVehicleFuelProductContract
    model: string
    modelYear: number
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
    costPerKilometer: null | string
    costPerKilometerBreakdown: FleetVehicleCostBreakdownContract | null
    costsUpdatedAt: null | string
    createdAt: string
    fuelPrice: FleetVehicleFuelPriceContract | null
    id: string
    monthlyFixedCost: null | string
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

/** Custo não informado é zero na escala fiscal, nunca vazio — é o que a API aceita. */
export const VEHICLE_COST_DRAFT = {
  acquisitionAmount: '0.0000',
  annualInsuranceAmount: '0.0000',
  annualVehicleTaxAmount: '0.0000',
  averageConsumption: '0.00',
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.0000',
} as const satisfies FleetVehicleCostFieldsContract

export const VEHICLE_BODY = {
  acquisitionAmount: '150000.0000',
  annualInsuranceAmount: '3600.0000',
  annualVehicleTaxAmount: '1200.0000',
  averageConsumption: '2.50',
  axleCount: 3,
  bodyType: '00',
  brand: 'Marca Sintetica',
  capacityCubicMeters: '90.00',
  capacityKilograms: '27000.00',
  color: 'branca',
  fleetNumber: '101',
  fuelType: 'diesel-s10',
  model: 'Modelo Sintetico',
  modelYear: 2020,
  monthlyInstallmentAmount: '2000.0000',
  otherCostsPerKilometer: '0.5000',
  owner: null,
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  state: 'SP',
  tareWeightKilograms: '8000.00',
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

export const VEHICLE_COSTS_UPDATED_AT = '2026-07-28T12:00:00.000Z'

/** Prestação + (IPVA + seguro) ÷ 12 = 2000 + 4800 ÷ 12, derivado pela API e relido pela tela. */
export const VEHICLE_MONTHLY_FIXED_COST = '2400.0000'

export const VEHICLE_FUEL_PRICE = {
  pricePerUnit: '5.4800',
  source: 'anp',
  unit: 'litre',
  weekEndingOn: '2026-07-25',
} as const satisfies FleetVehicleFuelPriceContract

/** 5,48 ÷ 2,50 fecha em 2,1920 antes da soma — a mesma conta de T006, agora vista pela tela. */
export const VEHICLE_COST_BREAKDOWN = {
  fuel: '2.1920',
  otherCosts: '0.5000',
} as const satisfies FleetVehicleCostBreakdownContract

export const VEHICLE_COST_PER_KILOMETER = '2.6920'

export const VEHICLE_DERIVED_COSTS = {
  costPerKilometer: VEHICLE_COST_PER_KILOMETER,
  costPerKilometerBreakdown: VEHICLE_COST_BREAKDOWN,
  fuelPrice: VEHICLE_FUEL_PRICE,
} as const

export const VEHICLE_DETAIL = {
  ...VEHICLE_BODY,
  ...VEHICLE_DERIVED_COSTS,
  costsUpdatedAt: VEHICLE_COSTS_UPDATED_AT,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: VEHICLE_ID,
  monthlyFixedCost: VEHICLE_MONTHLY_FIXED_COST,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
} as const satisfies FleetVehicleDetailContract

export const NO_COSTS_VEHICLE_DETAIL = {
  ...VEHICLE_DETAIL,
  ...VEHICLE_COST_DRAFT,
  costPerKilometer: null,
  costPerKilometerBreakdown: null,
  costsUpdatedAt: null,
  fuelPrice: null,
  monthlyFixedCost: null,
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
  ...VEHICLE_DERIVED_COSTS,
  costsUpdatedAt: VEHICLE_COSTS_UPDATED_AT,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: DRIVER_OWNED_VEHICLE_ID,
  monthlyFixedCost: VEHICLE_MONTHLY_FIXED_COST,
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
  ...VEHICLE_COST_DRAFT,
  axleCount: 0,
  bodyType: '00',
  brand: '',
  capacityCubicMeters: '0.00',
  capacityKilograms: '0.00',
  color: '',
  fleetNumber: '',
  fuelType: 'diesel-s10',
  model: '',
  modelYear: 0,
  owner: null,
  ownership: 'own',
  plate: '',
  renavam: '',
  role: 'traction',
  state: '',
  tareWeightKilograms: '0.00',
  wheelType: '',
} as const satisfies FleetVehicleBodyContract

export const INCOMPLETE_TRACTION_VEHICLE_ID = '00000000-0000-4000-8000-000000000914'

export const INCOMPLETE_TRACTION_VEHICLE_BODY = {
  ...VEHICLE_BODY,
  plate: 'INC1M23',
  wheelType: '',
} as const satisfies FleetVehicleBodyContract

export const INCOMPLETE_TRACTION_VEHICLE_DETAIL = {
  ...INCOMPLETE_TRACTION_VEHICLE_BODY,
  ...VEHICLE_DERIVED_COSTS,
  costsUpdatedAt: VEHICLE_COSTS_UPDATED_AT,
  createdAt: '2026-07-28T12:00:00.000Z',
  id: INCOMPLETE_TRACTION_VEHICLE_ID,
  monthlyFixedCost: VEHICLE_MONTHLY_FIXED_COST,
  status: 'active',
  updatedAt: '2026-07-28T12:00:00.000Z',
  version: '1',
} as const satisfies FleetVehicleDetailContract

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
