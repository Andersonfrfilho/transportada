/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { VehicleColor } from './fleet.types'

export const FLEET_VEHICLES_PATH = '/fleet/vehicles'
export const FLEET_DRIVERS_PATH = '/fleet/drivers'
export const FLEET_CAPABILITIES_PATH = '/fleet/capabilities'
export const FLEET_VEHICLE_CATALOG_BRANDS_PATH = '/fleet/vehicle-catalog/brands'
export const FLEET_VEHICLE_CATALOG_MODELS_PATH = '/fleet/vehicle-catalog/models'
export const FLEET_READ_PERMISSION = 'fleet.read'
export const FLEET_MANAGE_PERMISSION = 'fleet.manage'

export const FLEET_ERROR = {
  FORBIDDEN: 'FLEET_FORBIDDEN',
  INVALID_DRAFT: 'FLEET_INVALID_DRAFT',
  REQUEST_FAILED: 'FLEET_REQUEST_FAILED',
  RESPONSE_INVALID: 'FLEET_RESPONSE_INVALID',
} as const

export const FLEET_VERSION_CONFLICT_ERROR = [
  'FLEET_VEHICLE_VERSION_CONFLICT',
  'FLEET_DRIVER_VERSION_CONFLICT',
] as const

export const FLEET_PAGE_SIZE = 25

/** Teto de segurança do laço de cursor da tabela de veículos — frota real não chega perto. */
export const FLEET_VEHICLE_LOAD_LIMIT = 2000

export const FLEET_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  FLEET_DRIVER_MEMBERSHIP_NOT_FOUND: 'membershipNotFound',
  FLEET_DRIVER_MEMBERSHIP_TAKEN: 'membershipTaken',
  FLEET_DRIVER_TAX_ID_TAKEN: 'taxIdTaken',
  FLEET_DRIVER_VERSION_CONFLICT: 'versionConflict',
  FLEET_FORBIDDEN: 'readOnly',
  FLEET_INVALID_DRAFT: 'invalidDraft',
  FLEET_VEHICLE_NOT_FOUND: 'vehicleNotFound',
  FLEET_VEHICLE_PLATE_TAKEN: 'plateTaken',
  FLEET_VEHICLE_VERSION_CONFLICT: 'versionConflict',
}

/** O tom real do CRLV vive em `:root`; aqui só o caminho até ele, para nenhum módulo pintar cor crua. */
export const VEHICLE_COLOR_SWATCH: Readonly<Record<VehicleColor, string>> = {
  amarela: 'var(--vehicle-color-amarela)',
  azul: 'var(--vehicle-color-azul)',
  azul_marinho: 'var(--vehicle-color-azul_marinho)',
  bege: 'var(--vehicle-color-bege)',
  branca: 'var(--vehicle-color-branca)',
  champanhe: 'var(--vehicle-color-champanhe)',
  cinza: 'var(--vehicle-color-cinza)',
  creme: 'var(--vehicle-color-creme)',
  dourada: 'var(--vehicle-color-dourada)',
  fantasia: 'var(--vehicle-color-fantasia)',
  grafite: 'var(--vehicle-color-grafite)',
  grena: 'var(--vehicle-color-grena)',
  laranja: 'var(--vehicle-color-laranja)',
  marrom: 'var(--vehicle-color-marrom)',
  prata: 'var(--vehicle-color-prata)',
  preta: 'var(--vehicle-color-preta)',
  rosa: 'var(--vehicle-color-rosa)',
  roxa: 'var(--vehicle-color-roxa)',
  turquesa: 'var(--vehicle-color-turquesa)',
  verde: 'var(--vehicle-color-verde)',
  vermelha: 'var(--vehicle-color-vermelha)',
}

export const OWNER_KEYS = ['name', 'rntrc', 'state', 'taxId', 'taxRegime'] as const

export const VEHICLE_COST_BREAKDOWN_KEYS = ['fuel', 'otherCosts'] as const

export const VEHICLE_FUEL_PRICE_KEYS = ['pricePerUnit', 'source', 'unit', 'weekEndingOn'] as const

export const DRIVER_VEHICLE_LINK_KEYS = ['assignedAt', 'id', 'ownedByDriver', 'vehicle'] as const

/** A caixa de vínculos lista a frota inteira de uma vez; não há paginação dentro do formulário. */
export const FLEET_VEHICLE_OPTIONS_PAGE_SIZE = 100

export const VEHICLE_COST_KEYS = [
  'acquisitionAmount',
  'annualInsuranceAmount',
  'annualVehicleTaxAmount',
  'averageConsumption',
  'monthlyInstallmentAmount',
  'otherCostsPerKilometer',
] as const

/** Tara e capacidade: decimais em pt-BR na tela, decimais na API, inteiros só na borda do MDF-e. */
export const VEHICLE_MEASURE_KEYS = [
  'capacityCubicMeters',
  'capacityKilograms',
  'tareWeightKilograms',
] as const

export const VEHICLE_BODY_KEYS = [
  ...VEHICLE_COST_KEYS,
  'axleCount',
  'bodyType',
  'brand',
  'capacityCubicMeters',
  'capacityKilograms',
  'color',
  'fleetNumber',
  'fuelType',
  'model',
  'modelYear',
  'owner',
  'ownership',
  'plate',
  'renavam',
  'role',
  'state',
  'tareWeightKilograms',
  'wheelType',
] as const

export const VEHICLE_DETAIL_KEYS = [
  ...VEHICLE_BODY_KEYS,
  'costPerKilometer',
  'costPerKilometerBreakdown',
  'costsUpdatedAt',
  'createdAt',
  'fuelPrice',
  'id',
  'monthlyFixedCost',
  'status',
  'updatedAt',
  'version',
] as const

export const VEHICLE_FORM_KEYS = [
  ...VEHICLE_COST_KEYS,
  'axleCount',
  'bodyType',
  'brand',
  'capacityCubicMeters',
  'capacityKilograms',
  'color',
  'fleetNumber',
  'fuelType',
  'model',
  'modelYear',
  'ownerName',
  'ownerRntrc',
  'ownerState',
  'ownerTaxId',
  'ownerTaxRegime',
  'ownership',
  'plate',
  'renavam',
  'role',
  'state',
  'tareWeightKilograms',
  'wheelType',
] as const

export const FLEET_CAPABILITY_KEYS = ['vehicleCatalog'] as const

export const DRIVER_BODY_KEYS = [
  'licenseNumber',
  'linkedTaxId',
  'membershipId',
  'name',
  'phone',
  'taxId',
] as const

export const DRIVER_FORM_KEYS = DRIVER_BODY_KEYS

export const DRIVER_DETAIL_KEYS = [
  ...DRIVER_BODY_KEYS,
  'createdAt',
  'id',
  'status',
  'updatedAt',
  'version',
] as const
