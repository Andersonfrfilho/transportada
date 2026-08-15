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
  VEHICLE_COLORS,
} from '../../database/fleet.schema.js'
import { FUEL_TYPES, type FuelProduct } from '../../shared/fuel.constant.js'
import { RNTRC_INPUT } from '../../shared/rntrc.service.js'
import { buildOptionalTaxIdSchema, buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { CNPJ_PATTERN, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'

const AXLE_COUNT_MAX = 9
const AXLE_COUNT_MIN = 2
const CONSUMPTION_DECIMAL = /^(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{2})$/
const COST_PER_KILOMETER_DECIMAL = /^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{4})$/
const CPF = /^[0-9]{11}$/
const MODEL_YEAR_MAX = 2100
const MODEL_YEAR_MIN = 1900
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
const NAME_MAX_LENGTH = 60
const NOT_INFORMED = 0
const OWN_OWNERSHIP = 'own'
const PHONE = /^[0-9]{10,11}$/
const PLATE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const RENAVAM = /^[0-9]{9,11}$/
const STATE = /^[A-Z]{2}$/
const TRACTION_ROLE = 'traction'
const UNSIGNED_BIGINT = /^(?:0|[1-9][0-9]{0,18})$/
const VEHICLE_BRAND_MAX_LENGTH = 60
const VEHICLE_FLEET_NUMBER_MAX_LENGTH = 20
const VEHICLE_MODEL_MAX_LENGTH = 120

/** `z.enum` pede tupla não vazia; o catálogo é `readonly`, e derivá-la aqui evita uma segunda lista. */
const FUEL_PRODUCTS_TUPLE = FUEL_TYPES.map(({ product }) => product) as [
  FuelProduct,
  ...FuelProduct[],
]

const optionalDigits = (pattern: RegExp) => z.literal('').or(z.string().regex(pattern))

const optionalRangedInteger = (min: number, max: number) =>
  z
    .number()
    .int()
    .refine((value) => value === NOT_INFORMED || (value >= min && value <= max))

const ownerSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    rntrc: z.string().regex(RNTRC_INPUT),
    state: z.string().regex(STATE),
    taxId: buildTaxIdSchema(TAX_ID_PATTERN),
    taxRegime: z.enum(MDFE_OWNER_TAX_REGIMES),
  })
  .strict()

const vehicleFieldsSchema = z.object({
  acquisitionAmount: z.string().regex(MONEY_DECIMAL),
  annualInsuranceAmount: z.string().regex(MONEY_DECIMAL),
  annualVehicleTaxAmount: z.string().regex(MONEY_DECIMAL),
  averageConsumption: z.string().regex(CONSUMPTION_DECIMAL),
  axleCount: optionalRangedInteger(AXLE_COUNT_MIN, AXLE_COUNT_MAX),
  bodyType: z.enum(MDFE_BODY_TYPES),
  brand: z.string().trim().max(VEHICLE_BRAND_MAX_LENGTH),
  capacityCubicMeters: z.string().regex(UNSIGNED_BIGINT),
  capacityKilograms: z.string().regex(UNSIGNED_BIGINT),
  color: z.literal('').or(z.enum(VEHICLE_COLORS)),
  fleetNumber: z.string().trim().max(VEHICLE_FLEET_NUMBER_MAX_LENGTH),
  fuelType: z.enum(FUEL_PRODUCTS_TUPLE),
  model: z.string().trim().max(VEHICLE_MODEL_MAX_LENGTH),
  modelYear: optionalRangedInteger(MODEL_YEAR_MIN, MODEL_YEAR_MAX),
  monthlyInstallmentAmount: z.string().regex(MONEY_DECIMAL),
  otherCostsPerKilometer: z.string().regex(COST_PER_KILOMETER_DECIMAL),
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
  linkedTaxId: buildOptionalTaxIdSchema(CNPJ_PATTERN),
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
