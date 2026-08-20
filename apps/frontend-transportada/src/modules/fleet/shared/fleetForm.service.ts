/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DEFAULT_FUEL_PRODUCT } from '@/modules/shared/fuel.constant'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { DRIVER_FORM_KEYS, FLEET_ERROR, VEHICLE_FORM_KEYS } from './fleet.constant'
import { VEHICLE_COLOR, type VehicleColor } from './fleet.types'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetVehicleBody,
  FleetVehicleCatalogOption,
  FleetVehicleCatalogSource,
  FleetVehicleDetail,
  FleetVehicleFormState,
} from './fleet.types'
import { toVehicleCostBody, toVehicleCostFormState } from './fleetVehicleCost.service'
import { toVehicleMeasureBody, toVehicleMeasureFormState } from './fleetVehicleMeasure.service'

const OWN_OWNERSHIP = 'own'
const UNAVAILABLE_CATALOG_SOURCE: FleetVehicleCatalogSource = 'unavailable'
const TRACTION_ROLE = 'traction'
const TRAILER_ROLE = 'trailer'
const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Z]/g
const NON_DIGIT_PATTERN = /[^0-9]/g
const LEADING_ZERO_PATTERN = /^0+(?=[0-9])/

export const EMPTY_VEHICLE_FORM: FleetVehicleFormState = {
  acquisitionAmount: '',
  annualInsuranceAmount: '',
  annualVehicleTaxAmount: '',
  averageConsumption: '',
  axleCount: '0',
  bodyType: '00',
  brand: '',
  capacityCubicMeters: '',
  capacityKilograms: '',
  color: '',
  fleetNumber: '',
  freightClass: '',
  fuelType: DEFAULT_FUEL_PRODUCT,
  model: '',
  modelYear: '0',
  monthlyInstallmentAmount: '',
  otherCostsPerKilometer: '',
  ownerName: '',
  ownerRntrc: '',
  ownerState: '',
  ownerTaxId: '',
  ownerTaxRegime: '0',
  ownership: OWN_OWNERSHIP,
  plate: '',
  renavam: '',
  role: TRACTION_ROLE,
  state: '',
  tareWeightKilograms: '',
  wheelType: '',
}

const EMPTY_DRIVER_FORM: FleetDriverFormState = {
  addressCity: '',
  addressComplement: '',
  addressDistrict: '',
  addressNumber: '',
  addressPostalCode: '',
  addressState: '',
  addressStreet: '',
  birthDate: '',
  licenseExpiresAt: '',
  licenseNumber: '',
  linkedTaxId: '',
  membershipId: '',
  name: '',
  phone: '',
  taxId: '',
}

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(NON_ALPHANUMERIC_PATTERN, '')
}

export function normalizeDigits(value: string): string {
  return value.replace(NON_DIGIT_PATTERN, '')
}

export function normalizeUnsignedInteger(value: string): string {
  const digits = normalizeDigits(value)
  if (digits.length === 0) return '0'
  return digits.replace(LEADING_ZERO_PATTERN, '')
}

function assertKnownKeys(input: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const hasForeignKey = Object.keys(input).some((key) => !keys.includes(key))
  if (hasForeignKey) throw new Error(FLEET_ERROR.INVALID_DRAFT)
}

export function createVehicleDraft(
  input: Readonly<Record<string, unknown>> = {},
): FleetVehicleFormState {
  assertKnownKeys(input, VEHICLE_FORM_KEYS)
  return { ...EMPTY_VEHICLE_FORM, ...(input as Partial<FleetVehicleFormState>) }
}

export function createDriverDraft(
  input: Readonly<Record<string, unknown>> = {},
): FleetDriverFormState {
  assertKnownKeys(input, DRIVER_FORM_KEYS)
  return { ...EMPTY_DRIVER_FORM, ...(input as Partial<FleetDriverFormState>) }
}

/** Frota cadastrada antes da lista fechada guarda texto livre: o select não pode exibir "Prata metálico". */
function toVehicleColor(value: string): '' | VehicleColor {
  return VEHICLE_COLOR.find((color) => color === value) ?? ''
}

export function toVehicleFormState(vehicle: FleetVehicleDetail): FleetVehicleFormState {
  return {
    axleCount: String(vehicle.axleCount),
    bodyType: vehicle.bodyType,
    brand: vehicle.brand,
    color: toVehicleColor(vehicle.color),
    fleetNumber: vehicle.fleetNumber,
    freightClass: vehicle.freightClass,
    fuelType: vehicle.fuelType,
    model: vehicle.model,
    modelYear: String(vehicle.modelYear),
    ownerName: vehicle.owner?.name ?? '',
    ownerRntrc: vehicle.owner?.rntrc ?? '',
    ownerState: vehicle.owner?.state ?? '',
    ownerTaxId: vehicle.owner?.taxId ?? '',
    ownerTaxRegime: vehicle.owner?.taxRegime ?? '0',
    ownership: vehicle.ownership,
    plate: vehicle.plate,
    renavam: vehicle.renavam,
    role: vehicle.role,
    state: vehicle.state,
    wheelType: vehicle.wheelType,
    ...toVehicleCostFormState(vehicle),
    ...toVehicleMeasureFormState(vehicle),
  }
}

export function toDriverFormState(driver: FleetDriverDetail): FleetDriverFormState {
  return {
    addressCity: driver.address.city,
    addressComplement: driver.address.complement,
    addressDistrict: driver.address.district,
    addressNumber: driver.address.number,
    addressPostalCode: driver.address.postalCode,
    addressState: driver.address.state,
    addressStreet: driver.address.street,
    birthDate: driver.birthDate ?? '',
    licenseExpiresAt: driver.licenseExpiresAt ?? '',
    licenseNumber: driver.licenseNumber,
    linkedTaxId: driver.linkedTaxId,
    membershipId: driver.membershipId ?? '',
    name: driver.name,
    phone: driver.phone,
    taxId: driver.taxId,
  }
}

/** Marca desconhecida invalida o modelo escolhido antes. */
export function applyVehicleBrand(
  state: FleetVehicleFormState,
  brand: string,
): FleetVehicleFormState {
  return { ...state, brand, model: '' }
}

/** O endpoint de modelos é indexado por código FIPE; o formulário só conhece o nome escolhido. */
export function resolveVehicleCatalogCode(
  input: Readonly<{ items: readonly FleetVehicleCatalogOption[] | undefined; name: string }>,
): string {
  return input.items?.find((option) => option.name === input.name)?.code ?? ''
}

/** Reboque não tem marca/modelo no catálogo FIPE — sempre texto livre. */
export function canUseVehicleCatalogFields(
  input: Readonly<{ role: string; vehicleCatalogEnabled: boolean }>,
): boolean {
  return input.vehicleCatalogEnabled && input.role !== TRAILER_ROLE
}

export const VEHICLE_CATALOG_FIELD_MODE = {
  BLOCKED: 'blocked',
  LIST: 'list',
  TEXT: 'text',
} as const

export type VehicleCatalogFieldMode =
  (typeof VEHICLE_CATALOG_FIELD_MODE)[keyof typeof VEHICLE_CATALOG_FIELD_MODE]

/**
 * O gateway da API engole a falha do provedor e responde 200 com `source: 'unavailable'` —
 * a query nunca rejeita, então a indisponibilidade só aparece se a resposta for lida.
 */
export function hasVehicleCatalogFailure(
  input: Readonly<{ isError: boolean; source: FleetVehicleCatalogSource | undefined }>,
): boolean {
  return input.isError || input.source === UNAVAILABLE_CATALOG_SOURCE
}

/**
 * O segmento do provedor vem do rodado, e o rodado é escolhido no bloco seguinte do formulário:
 * sem ele a lista chega vazia, e vazia sem motivo é lida como carregamento que nunca termina.
 * Provedor fora do ar volta para texto livre — catálogo é conveniência, não autoridade.
 */
export function resolveVehicleCatalogFieldMode(
  input: Readonly<{
    hasCatalogFailure: boolean
    role: string
    vehicleCatalogEnabled: boolean
    wheelType: string
  }>,
): VehicleCatalogFieldMode {
  const { BLOCKED, LIST, TEXT } = VEHICLE_CATALOG_FIELD_MODE
  if (!canUseVehicleCatalogFields(input)) return TEXT
  if (input.hasCatalogFailure) return TEXT
  if (input.wheelType === '') return BLOCKED
  return LIST
}

export function toVehicleBody(state: FleetVehicleFormState): FleetVehicleBody {
  const isOwn = state.ownership === OWN_OWNERSHIP
  return {
    axleCount: Number(normalizeUnsignedInteger(state.axleCount)),
    bodyType: state.bodyType,
    brand: state.brand,
    color: state.color,
    fleetNumber: state.fleetNumber,
    // A classe é do veículo que traciona: implemento não puxa frete, e guardá-la nele mente na tabela
    freightClass: state.role === TRACTION_ROLE ? state.freightClass : '',
    fuelType: state.fuelType,
    model: state.model,
    modelYear: Number(normalizeUnsignedInteger(state.modelYear)),
    owner: isOwn
      ? null
      : {
          name: state.ownerName,
          rntrc: normalizeDigits(state.ownerRntrc),
          state: state.ownerState.toUpperCase(),
          taxId: normalizeTaxId(state.ownerTaxId),
          taxRegime: state.ownerTaxRegime,
        },
    ownership: state.ownership,
    plate: normalizePlate(state.plate),
    renavam: normalizeDigits(state.renavam),
    role: state.role,
    state: state.state.toUpperCase(),
    wheelType: state.role === TRACTION_ROLE ? state.wheelType : '',
    ...toVehicleCostBody(state),
    ...toVehicleMeasureBody(state),
  }
}

export function toDriverBody(state: FleetDriverFormState): FleetDriverBody {
  return {
    address: {
      city: state.addressCity,
      complement: state.addressComplement,
      district: state.addressDistrict,
      number: state.addressNumber,
      postalCode: normalizeDigits(state.addressPostalCode),
      state: state.addressState.toUpperCase(),
      street: state.addressStreet,
    },
    birthDate: state.birthDate === '' ? null : state.birthDate,
    licenseExpiresAt: state.licenseExpiresAt === '' ? null : state.licenseExpiresAt,
    licenseNumber: normalizeDigits(state.licenseNumber),
    linkedTaxId: normalizeTaxId(state.linkedTaxId),
    membershipId: state.membershipId === '' ? null : state.membershipId,
    name: state.name,
    phone: normalizeDigits(state.phone),
    taxId: normalizeDigits(state.taxId),
  }
}
