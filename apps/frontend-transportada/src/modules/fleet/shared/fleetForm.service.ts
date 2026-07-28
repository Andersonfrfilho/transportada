/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_FORM_KEYS, FLEET_ERROR, VEHICLE_FORM_KEYS } from './fleet.constant'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFormState,
} from './fleet.types'

const OWN_OWNERSHIP = 'own'
const TRACTION_ROLE = 'traction'
const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Z]/g
const NON_DIGIT_PATTERN = /[^0-9]/g
const LEADING_ZERO_PATTERN = /^0+(?=[0-9])/

const EMPTY_VEHICLE_FORM: FleetVehicleFormState = {
  bodyType: '00',
  capacityCubicMeters: '0',
  capacityKilograms: '0',
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
  tareWeightKilograms: '0',
  wheelType: '01',
}

const EMPTY_DRIVER_FORM: FleetDriverFormState = {
  licenseNumber: '',
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

export function toVehicleFormState(vehicle: FleetVehicleDetail): FleetVehicleFormState {
  return {
    bodyType: vehicle.bodyType,
    capacityCubicMeters: vehicle.capacityCubicMeters,
    capacityKilograms: vehicle.capacityKilograms,
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
    tareWeightKilograms: vehicle.tareWeightKilograms,
    wheelType: vehicle.wheelType === '' ? '01' : vehicle.wheelType,
  }
}

export function toDriverFormState(driver: FleetDriverDetail): FleetDriverFormState {
  return {
    licenseNumber: driver.licenseNumber,
    membershipId: driver.membershipId ?? '',
    name: driver.name,
    phone: driver.phone,
    taxId: driver.taxId,
  }
}

export function toVehicleBody(state: FleetVehicleFormState): FleetVehicleBody {
  const isOwn = state.ownership === OWN_OWNERSHIP
  return {
    bodyType: state.bodyType,
    capacityCubicMeters: normalizeUnsignedInteger(state.capacityCubicMeters),
    capacityKilograms: normalizeUnsignedInteger(state.capacityKilograms),
    owner: isOwn
      ? null
      : {
          name: state.ownerName,
          rntrc: normalizeDigits(state.ownerRntrc),
          state: state.ownerState.toUpperCase(),
          taxId: normalizeDigits(state.ownerTaxId),
          taxRegime: state.ownerTaxRegime,
        },
    ownership: state.ownership,
    plate: normalizePlate(state.plate),
    renavam: normalizeDigits(state.renavam),
    role: state.role,
    state: state.state.toUpperCase(),
    tareWeightKilograms: normalizeUnsignedInteger(state.tareWeightKilograms),
    wheelType: state.role === TRACTION_ROLE ? state.wheelType : '',
  }
}

export function toDriverBody(state: FleetDriverFormState): FleetDriverBody {
  return {
    licenseNumber: normalizeDigits(state.licenseNumber),
    membershipId: state.membershipId === '' ? null : state.membershipId,
    name: state.name,
    phone: normalizeDigits(state.phone),
    taxId: normalizeDigits(state.taxId),
  }
}
