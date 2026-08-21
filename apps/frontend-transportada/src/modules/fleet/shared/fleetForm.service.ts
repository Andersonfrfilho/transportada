/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DEFAULT_FUEL_PRODUCT } from '@/modules/shared/fuel.constant'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { joinDriverName, splitDriverName } from './driverName.service'
import { DRIVER_FORM_KEYS, FLEET_ERROR, VEHICLE_FORM_KEYS } from './fleet.constant'
import {
  LICENSE_CATEGORIES,
  type LicenseCategory,
  MDFE_OWNER_TAX_REGIME,
  type MdfeOwnerTaxRegime,
  VEHICLE_COLOR,
  type VehicleColor,
} from './fleet.types'
import type {
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetDriverProfile,
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
/** O motorista dirige o próprio veículo ou o da empresa — é o perfil que serve a mais frotas. */
const DEFAULT_DRIVER_PROFILE: FleetDriverProfile = 'driver'

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
  vehicleType: '',
}

const EMPTY_DRIVER_FORM: FleetDriverFormState = {
  addressCity: '',
  addressComplement: '',
  addressDistrict: '',
  addressNumber: '',
  addressPostalCode: '',
  addressState: '',
  addressStreet: '',
  anttCategory: '',
  birthCity: '',
  birthDate: '',
  birthState: '',
  email: '',
  fatherName: '',
  firstLicenseAt: '',
  licenseCategory: '',
  licenseExpiresAt: '',
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedLegalName: '',
  linkedTaxId: '',
  motherName: '',
  name: '',
  nationality: '',
  phone: '',
  profile: DEFAULT_DRIVER_PROFILE,
  rntrc: '',
  surname: '',
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
    vehicleType: vehicle.vehicleType,
    ...toVehicleCostFormState(vehicle),
    ...toVehicleMeasureFormState(vehicle),
  }
}

export function toDriverFormState(driver: FleetDriverDetail): FleetDriverFormState {
  const nameParts = splitDriverName(driver.name)
  return {
    addressCity: driver.address.city,
    addressComplement: driver.address.complement,
    addressDistrict: driver.address.district,
    addressNumber: driver.address.number,
    addressPostalCode: driver.address.postalCode,
    addressState: driver.address.state,
    addressStreet: driver.address.street,
    anttCategory: driver.anttCategory,
    birthCity: driver.birthCity,
    birthDate: driver.birthDate ?? '',
    birthState: driver.birthState,
    email: driver.email,
    fatherName: driver.fatherName,
    firstLicenseAt: driver.firstLicenseAt ?? '',
    licenseCategory: driver.licenseCategory,
    licenseExpiresAt: driver.licenseExpiresAt ?? '',
    licenseIssuedCity: driver.licenseIssuedCity,
    licenseIssuedState: driver.licenseIssuedState,
    licenseNumber: driver.licenseNumber,
    linkedLegalName: driver.linkedLegalName,
    linkedTaxId: driver.linkedTaxId,
    motherName: driver.motherName,
    name: nameParts.givenName,
    nationality: driver.nationality,
    phone: driver.phone,
    // A ficha carregada não traz perfil: a API não devolve papel de usuário, e editar não o reenvia
    profile: DEFAULT_DRIVER_PROFILE,
    rntrc: driver.rntrc,
    surname: nameParts.surname,
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
 * O segmento do provedor vem do tipo do veículo, escolhido no bloco anterior do formulário: sem ele
 * a lista chega vazia, e vazia sem motivo é lida como carregamento que nunca termina.
 * Provedor fora do ar volta para texto livre — catálogo é conveniência, não autoridade.
 */
export function resolveVehicleCatalogFieldMode(
  input: Readonly<{
    hasCatalogFailure: boolean
    role: string
    vehicleCatalogEnabled: boolean
    vehicleType: string
  }>,
): VehicleCatalogFieldMode {
  const { BLOCKED, LIST, TEXT } = VEHICLE_CATALOG_FIELD_MODE
  if (!canUseVehicleCatalogFields(input)) return TEXT
  if (input.hasCatalogFailure) return TEXT
  if (input.vehicleType === '') return BLOCKED
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
    // O tipo é do veículo que traciona: implemento não puxa frete, e guardá-lo nele mente na tabela
    vehicleType: state.role === TRACTION_ROLE ? state.vehicleType : '',
    ...toVehicleCostBody(state),
    ...toVehicleMeasureBody(state),
  }
}

/** Categoria fora do catálogo vira ausência: o CHECK do banco só conhece os três códigos da ANTT. */
function toLicenseCategory(value: string): '' | LicenseCategory {
  return LICENSE_CATEGORIES.find((category) => category === value) ?? ''
}

function toAnttCategory(value: string): '' | MdfeOwnerTaxRegime {
  return MDFE_OWNER_TAX_REGIME.find((category) => category === value) ?? ''
}

/** O vínculo fica de fora: quem o reenvia na edição é a ficha carregada, não o formulário. */
export function toDriverBody(state: FleetDriverFormState): Omit<FleetDriverBody, 'membershipId'> {
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
    anttCategory: toAnttCategory(state.anttCategory),
    birthCity: state.birthCity,
    birthDate: state.birthDate === '' ? null : state.birthDate,
    birthState: state.birthState.toUpperCase(),
    email: state.email.trim(),
    fatherName: state.fatherName,
    firstLicenseAt: state.firstLicenseAt === '' ? null : state.firstLicenseAt,
    licenseCategory: toLicenseCategory(state.licenseCategory),
    licenseExpiresAt: state.licenseExpiresAt === '' ? null : state.licenseExpiresAt,
    licenseIssuedCity: state.licenseIssuedCity,
    licenseIssuedState: state.licenseIssuedState.toUpperCase(),
    licenseNumber: normalizeDigits(state.licenseNumber),
    // Razão social sem CNPJ é recusada pela API: sem o vínculo ela não descreve empresa nenhuma
    linkedLegalName: state.linkedTaxId === '' ? '' : state.linkedLegalName,
    linkedTaxId: normalizeTaxId(state.linkedTaxId),
    motherName: state.motherName,
    name: joinDriverName({ givenName: state.name, surname: state.surname }),
    nationality: state.nationality,
    phone: normalizeDigits(state.phone),
    rntrc: normalizeDigits(state.rntrc),
    taxId: normalizeDigits(state.taxId),
  }
}

/** A criação abre o usuário do sistema, e o perfil é o papel que ela concede. */
export function toDriverCreateBody(state: FleetDriverFormState): FleetDriverCreateBody {
  return { ...toDriverBody(state), profile: state.profile }
}
