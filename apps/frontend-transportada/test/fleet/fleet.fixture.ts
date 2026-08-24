/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_MANAGE = 'fleet.manage'
export const FLEET_READ = 'fleet.read'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-28T12:00:00.000Z::00000000-0000-4000-8000-000000000911'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000902'
export const DRIVER_OWNED_VEHICLE_ID = '00000000-0000-4000-8000-000000000913'
export const FLEX_VEHICLE_ID = '00000000-0000-4000-8000-000000000915'
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
  | 'eletrico'
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
  secondaryAverageConsumption: string
}>

export type FleetVehicleCostBreakdownContract = Readonly<{
  fuel?: string
  otherCosts?: string
  primaryFuel?: string
  secondaryFuel?: string
}>

export type FleetVehicleFuelPriceContract = Readonly<{
  pricePerUnit: string
  source: 'anp' | 'manual'
  unit: 'cubic-metre' | 'kilowatt-hour' | 'litre'
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
    secondaryFuelType: '' | FleetVehicleFuelProductContract
    state: string
    tareWeightKilograms: string
    vehicleType:
      | ''
      | 'car'
      | 'motorcycle'
      | 'other'
      | 'three_quarter'
      | 'toco'
      | 'tractor_unit'
      | 'truck'
      | 'utility'
      | 'van'
      | 'vuc'
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
    secondaryFuelPrice: FleetVehicleFuelPriceContract | null
    status: 'active' | 'inactive'
    updatedAt: string
    version: string
  }>

export type FleetDriverAddressContract = Readonly<{
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type FleetDriverBodyContract = Readonly<{
  address: FleetDriverAddressContract
  anttCategory: '' | '0' | '1' | '2'
  birthCity: string
  birthDate: null | string
  birthState: string
  email: string
  fatherName: string
  firstLicenseAt: null | string
  identityDocument: string
  identityDocumentIssuer: string
  identityDocumentState: string
  licenseCategory: '' | 'A' | 'AB' | 'AC' | 'ACC' | 'AD' | 'AE' | 'B' | 'C' | 'D' | 'E'
  licenseExpiresAt: null | string
  licenseIssuedCity: string
  licenseIssuedState: string
  licenseNumber: string
  linkedAddress: FleetDriverAddressContract
  linkedLegalName: string
  linkedTaxId: string
  membershipId: null | string
  motherName: string
  name: string
  nationality: string
  phone: string
  rntrc: string
  taxId: string
}>

/** O perfil é o papel que a criação concede, e o vínculo nasce com ela: nenhum dos dois se digita. */
export type FleetDriverCreateBodyContract = Omit<FleetDriverBodyContract, 'membershipId'> &
  Readonly<{ profile: 'aggregate' | 'driver' }>

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
  secondaryAverageConsumption: '0.00',
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
  secondaryAverageConsumption: '0.00',
  secondaryFuelType: '',
  state: 'SP',
  tareWeightKilograms: '8000.00',
  vehicleType: 'tractor_unit',
} as const satisfies FleetVehicleBodyContract

export const AGGREGATE_VEHICLE_BODY = {
  ...VEHICLE_BODY,
  bodyType: '01',
  owner: VEHICLE_OWNER,
  ownership: 'aggregate',
  plate: 'XYZ9A88',
  role: 'trailer',
  vehicleType: '',
} as const satisfies FleetVehicleBodyContract

export const LINKED_COMPANY_TAX_ID = '12345678000195'

/** Endereço em branco é legítimo: a API exige o objeto, não o conteúdo. */
export const DRIVER_ADDRESS_DRAFT = {
  city: '',
  complement: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
} as const satisfies FleetDriverAddressContract

export const DRIVER_ADDRESS = {
  city: 'Sao Paulo',
  complement: 'Apto 42',
  district: 'Centro',
  number: '1000',
  postalCode: '01310930',
  state: 'SP',
  street: 'Avenida Paulista',
} as const satisfies FleetDriverAddressContract

export const DRIVER_BODY = {
  address: DRIVER_ADDRESS,
  anttCategory: '',
  birthCity: 'Ribeirão Preto',
  birthDate: '1985-04-12',
  birthState: 'SP',
  email: '',
  fatherName: 'Antônio da Silva',
  firstLicenseAt: '2008-03-14',
  identityDocument: '12.345.678-9',
  identityDocumentIssuer: 'SSP',
  identityDocumentState: 'SP',
  licenseCategory: 'E',
  licenseExpiresAt: '2030-04-12',
  licenseIssuedCity: 'Campinas',
  licenseIssuedState: 'SP',
  licenseNumber: '12345678901',
  linkedAddress: DRIVER_ADDRESS_DRAFT,
  linkedLegalName: '',
  linkedTaxId: '',
  membershipId: null,
  motherName: 'Maria da Silva',
  name: 'Jose da Silva',
  nationality: 'Brasileira',
  phone: '11988887777',
  rntrc: '',
  taxId: '12345678901',
} as const satisfies FleetDriverBodyContract

export const DRIVER_CREATE_BODY = {
  address: DRIVER_ADDRESS,
  anttCategory: '',
  birthCity: 'Ribeirão Preto',
  birthDate: '1985-04-12',
  birthState: 'SP',
  email: '',
  fatherName: 'Antônio da Silva',
  firstLicenseAt: '2008-03-14',
  identityDocument: '12.345.678-9',
  identityDocumentIssuer: 'SSP',
  identityDocumentState: 'SP',
  licenseCategory: 'E',
  licenseExpiresAt: '2030-04-12',
  licenseIssuedCity: 'Campinas',
  licenseIssuedState: 'SP',
  licenseNumber: '12345678901',
  linkedAddress: DRIVER_ADDRESS_DRAFT,
  linkedLegalName: '',
  linkedTaxId: '',
  motherName: 'Maria da Silva',
  name: 'Jose da Silva',
  nationality: 'Brasileira',
  phone: '11988887777',
  profile: 'driver',
  rntrc: '',
  taxId: '12345678901',
} as const satisfies FleetDriverCreateBodyContract

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
  secondaryFuelPrice: null,
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

/** Etanol é o segundo tanque do flex, e o preço dele é o do produto dele — nunca o do primeiro. */
export const VEHICLE_SECONDARY_FUEL_PRICE = {
  pricePerUnit: '4.2000',
  source: 'anp',
  unit: 'litre',
  weekEndingOn: '2026-07-25',
} as const satisfies FleetVehicleFuelPriceContract

/** 5,48 ÷ 12 dá 0,4567 e 4,20 ÷ 8 dá 0,5250: a parcela de combustível é a média, 0,4909. */
export const FLEX_COST_BREAKDOWN = {
  fuel: '0.4909',
  otherCosts: '0.5000',
  primaryFuel: '0.4567',
  secondaryFuel: '0.5250',
} as const satisfies FleetVehicleCostBreakdownContract

export const FLEX_VEHICLE_BODY = {
  ...VEHICLE_BODY,
  averageConsumption: '12.00',
  fuelType: 'gasolina-comum',
  plate: 'FLX1A23',
  secondaryAverageConsumption: '8.00',
  secondaryFuelType: 'etanol-hidratado',
} as const satisfies FleetVehicleBodyContract

export const FLEX_VEHICLE_DETAIL = {
  ...VEHICLE_DETAIL,
  ...FLEX_VEHICLE_BODY,
  costPerKilometer: '0.9909',
  costPerKilometerBreakdown: FLEX_COST_BREAKDOWN,
  id: FLEX_VEHICLE_ID,
  secondaryFuelPrice: VEHICLE_SECONDARY_FUEL_PRICE,
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
  secondaryFuelType: '',
  state: '',
  tareWeightKilograms: '0.00',
  vehicleType: '',
} as const satisfies FleetVehicleBodyContract

export const INCOMPLETE_TRACTION_VEHICLE_ID = '00000000-0000-4000-8000-000000000914'

export const INCOMPLETE_TRACTION_VEHICLE_BODY = {
  ...VEHICLE_BODY,
  plate: 'INC1M23',
  vehicleType: '',
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
  address: DRIVER_ADDRESS_DRAFT,
  anttCategory: '',
  birthCity: '',
  birthDate: null,
  birthState: '',
  email: '',
  fatherName: '',
  firstLicenseAt: null,
  identityDocument: '',
  identityDocumentIssuer: '',
  identityDocumentState: '',
  licenseCategory: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedAddress: DRIVER_ADDRESS_DRAFT,
  linkedLegalName: '',
  linkedTaxId: '',
  motherName: '',
  name: '',
  nationality: '',
  phone: '',
  rntrc: '',
  taxId: '',
} as const satisfies Omit<FleetDriverBodyContract, 'membershipId'>

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
