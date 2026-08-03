/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  FLEET_DRIVER_STATUSES,
  FLEET_VEHICLE_OWNERSHIPS,
  FLEET_VEHICLE_ROLES,
  FLEET_VEHICLE_STATUSES,
  MDFE_BODY_TYPES,
  MDFE_OWNER_TAX_REGIMES,
  MDFE_WHEEL_TYPES,
} from '../../database/fleet.schema.js'

const CNPJ = /^[0-9]{14}$/
const CPF = /^[0-9]{11}$/
const NAME_MAX_LENGTH = 60
const OWNER_TAX_ID = /^(?:[0-9]{11}|[0-9]{14})$/
const OWN_OWNERSHIP = 'own'
const PHONE = /^[0-9]{10,11}$/
const PLATE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const RENAVAM = /^[0-9]{9,11}$/
const RNTRC = /^[0-9]{8}$/
const STATE = /^[A-Z]{2}$/
const TRACTION_ROLE = 'traction'
const UNSIGNED_BIGINT = /^(?:0|[1-9][0-9]{0,18})$/

const optionalDigits = (pattern: RegExp) => z.literal('').or(z.string().regex(pattern))

const ownerSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    rntrc: z.string().regex(RNTRC),
    state: z.string().regex(STATE),
    taxId: z.string().regex(OWNER_TAX_ID),
    taxRegime: z.enum(MDFE_OWNER_TAX_REGIMES),
  })
  .strict()

const vehicleFieldsSchema = z.object({
  bodyType: z.enum(MDFE_BODY_TYPES),
  capacityCubicMeters: z.string().regex(UNSIGNED_BIGINT),
  capacityKilograms: z.string().regex(UNSIGNED_BIGINT),
  owner: ownerSchema.nullable(),
  ownership: z.enum(FLEET_VEHICLE_OWNERSHIPS),
  plate: z.string().regex(PLATE),
  renavam: optionalDigits(RENAVAM),
  role: z.enum(FLEET_VEHICLE_ROLES),
  state: z.string().regex(STATE),
  tareWeightKilograms: z.string().regex(UNSIGNED_BIGINT),
  wheelType: z.literal('').or(z.enum(MDFE_WHEEL_TYPES)),
})

const driverFieldsSchema = z.object({
  licenseNumber: optionalDigits(CPF),
  linkedTaxId: optionalDigits(CNPJ),
  membershipId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  phone: optionalDigits(PHONE),
  taxId: z.string().regex(CPF),
})

export const plateSchema = z.string().regex(PLATE)

export type FleetVehicleFields = z.infer<typeof vehicleFieldsSchema>
export type FleetDriverFields = z.infer<typeof driverFieldsSchema>

export const createVehicleSchema = vehicleFieldsSchema.strict().superRefine(assertVehicleRules)

export const updateVehicleSchema = vehicleFieldsSchema
  .extend({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    status: z.enum(FLEET_VEHICLE_STATUSES),
  })
  .strict()
  .superRefine(assertVehicleRules)

export const createDriverSchema = driverFieldsSchema.strict()

export const replaceDriverVehiclesSchema = z
  .object({
    vehicleIds: z
      .array(z.uuid())
      .refine((value) => new Set(value).size === value.length, 'vehicleIds must be unique'),
  })
  .strict()

export const updateDriverSchema = driverFieldsSchema
  .extend({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    status: z.enum(FLEET_DRIVER_STATUSES),
  })
  .strict()

function assertVehicleRules(value: FleetVehicleFields, context: z.RefinementCtx): void {
  // tpRod só existe no veicTracao — rodado em reboque é rejeição na SEFAZ
  if ((value.role === TRACTION_ROLE) !== (value.wheelType !== '')) {
    context.addIssue({ code: 'custom', message: 'wheelType belongs to traction vehicles only' })
  }
  // O grupo <prop> é tudo-ou-nada e proibido quando o veículo é do próprio emitente
  if ((value.ownership === OWN_OWNERSHIP) !== (value.owner === null)) {
    context.addIssue({ code: 'custom', message: 'owner is required unless the vehicle is own' })
  }
}
