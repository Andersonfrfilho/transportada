/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_VEHICLES_PATH = '/fleet/vehicles'
export const FLEET_DRIVERS_PATH = '/fleet/drivers'
export const FLEET_VEHICLE_LOOKUP_PATH = '/fleet/vehicles/lookup'
export const FLEET_CAPABILITIES_PATH = '/fleet/capabilities'
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

export const FLEET_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  FLEET_DRIVER_MEMBERSHIP_NOT_FOUND: 'membershipNotFound',
  FLEET_DRIVER_MEMBERSHIP_TAKEN: 'membershipTaken',
  FLEET_DRIVER_TAX_ID_TAKEN: 'taxIdTaken',
  FLEET_DRIVER_VERSION_CONFLICT: 'versionConflict',
  FLEET_FORBIDDEN: 'readOnly',
  FLEET_INVALID_DRAFT: 'invalidDraft',
  FLEET_VEHICLE_LOOKUP_FAILED: 'lookupFailed',
  FLEET_VEHICLE_LOOKUP_UNAVAILABLE: 'lookupUnavailable',
  FLEET_VEHICLE_NOT_FOUND: 'vehicleNotFound',
  FLEET_VEHICLE_PLATE_TAKEN: 'plateTaken',
  FLEET_VEHICLE_VERSION_CONFLICT: 'versionConflict',
}

export const OWNER_KEYS = ['name', 'rntrc', 'state', 'taxId', 'taxRegime'] as const

export const DRIVER_VEHICLE_LINK_KEYS = ['assignedAt', 'id', 'ownedByDriver', 'vehicle'] as const

/** A caixa de vínculos lista a frota inteira de uma vez; não há paginação dentro do formulário. */
export const FLEET_VEHICLE_OPTIONS_PAGE_SIZE = 100

export const VEHICLE_BODY_KEYS = [
  'bodyType',
  'capacityCubicMeters',
  'capacityKilograms',
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
  'createdAt',
  'id',
  'status',
  'updatedAt',
  'version',
] as const

export const VEHICLE_FORM_KEYS = [
  'bodyType',
  'capacityCubicMeters',
  'capacityKilograms',
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

export const VEHICLE_LOOKUP_KEYS = [
  'brand',
  'capacityKilograms',
  'model',
  'modelYear',
  'ownerName',
  'ownerTaxId',
  'plate',
  'renavam',
  'state',
  'tareWeightKilograms',
] as const

export const FLEET_CAPABILITY_KEYS = ['vehicleLookup'] as const

/** Campos da consulta por placa que existem no formulário; marca, modelo e ano não têm campo. */
export const VEHICLE_LOOKUP_FORM_KEYS = [
  'capacityKilograms',
  'ownerName',
  'ownerTaxId',
  'plate',
  'renavam',
  'state',
  'tareWeightKilograms',
] as const

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
