/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'
import { LOADING_ACCESS_KINDS } from '../../shared/loading-access.constant.js'

import {
  FLEET_DRIVER_STATUSES,
  FLEET_VEHICLE_OWNERSHIPS,
  FLEET_VEHICLE_ROLES,
  FLEET_VEHICLE_STATUSES,
  MDFE_BODY_TYPES,
  MDFE_OWNER_TAX_REGIMES,
  VEHICLE_COLORS,
} from '../../database/fleet.schema.js'
import { FUEL_TYPES, type FuelProduct } from '../../shared/fuel.constant.js'
import {
  IDENTITY_DOCUMENT_ISSUERS,
  IDENTITY_DOCUMENT_MAX_LENGTH,
} from '../../shared/identity-document-issuer.constant.js'
import { LICENSE_CATEGORIES } from '../../shared/license-category.constant.js'
import { PIX_KEY_MAX_LENGTH, PIX_KEY_TYPES } from '../../shared/pix-key-type.constant.js'
import { FLEET_DRIVER_PROFILES } from '../domain/fleet-driver-profile.constant.js'
import { RNTRC_INPUT } from '../../shared/rntrc.service.js'
import { buildOptionalTaxIdSchema, buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { CNPJ_PATTERN, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import { VEHICLE_TYPES } from '../../shared/vehicle-type.constant.js'

const AXLE_COUNT_MAX = 9
const AXLE_COUNT_MIN = 2
const CONSUMPTION_DECIMAL = /^(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{2})$/
const NO_CONSUMPTION = '0.00'
const COST_PER_KILOMETER_DECIMAL = /^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{4})$/
const CPF = /^[0-9]{11}$/
const DATE_LENGTH = 10
const DRIVER_ADDRESS_NUMBER_MAX_LENGTH = 20
const DRIVER_CITY_MAX_LENGTH = 60
const DRIVER_NATIONALITY_MAX_LENGTH = 40
const DRIVER_COMPLEMENT_MAX_LENGTH = 60
const DRIVER_DISTRICT_MAX_LENGTH = 60
const DRIVER_STREET_MAX_LENGTH = 120
/** Gêmeo do `fleet_drivers_email_check`: forma, não existência — o endereço só se prova no envio. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const EMAIL_MAX_LENGTH = 254
const POSTAL_CODE = /^[0-9]{8}$/
const MEASURE_DECIMAL = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{2})$/
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
const VEHICLE_BRAND_MAX_LENGTH = 60
const VEHICLE_FLEET_NUMBER_MAX_LENGTH = 20
const VEHICLE_MODEL_MAX_LENGTH = 120

/** `z.enum` pede tupla não vazia; o catálogo é `readonly`, e derivá-la aqui evita uma segunda lista. */
const FUEL_PRODUCTS_TUPLE = FUEL_TYPES.map(({ product }) => product) as [
  FuelProduct,
  ...FuelProduct[],
]

const optionalDigits = (pattern: RegExp) => z.literal('').or(z.string().regex(pattern))

/** Data ausente é `null`: coluna `date` não tem string vazia como o `text` dos campos opcionais. */
const optionalDate = () => z.iso.date().nullable()

const optionalPastDate = () =>
  optionalDate().refine(
    (value) => value === null || value <= today(),
    'date must not be in the future',
  )

function today(): string {
  return new Date().toISOString().slice(0, DATE_LENGTH)
}

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

/**
 * ⚠️ Os mesmos pisos e tetos dos CHECKs `fleet_vehicles_cargo_{length,width,height}_check`. Sem
 * eles a fronteira aceita os 2,5 cm que a spec 088 cita como caso extremo, o `INSERT` estoura o
 * CHECK e o Exception Filter devolve **500 genérico** — nenhum campo marcado, e a separação dos
 * três CHECKs (feita justamente para nomear qual medida está fora) sem leitor nenhum.
 *
 * Zero continua passando: é ausência de medida, e é o estado da frota que ainda não mediu.
 */
const CARGO_DIMENSION_BOUNDS = {
  cargoHeightMeters: { max: 5, min: 0.3 },
  cargoLengthMeters: { max: 30, min: 0.3 },
  cargoWidthMeters: { max: 4, min: 0.3 },
} as const

function buildCargoDimensionSchema(key: keyof typeof CARGO_DIMENSION_BOUNDS) {
  const { max, min } = CARGO_DIMENSION_BOUNDS[key]

  return z
    .string()
    .regex(MEASURE_DECIMAL)
    .refine((value) => {
      const metres = Number(value)
      return metres === 0 || (metres >= min && metres <= max)
    })
}

const vehicleFieldsSchema = z.object({
  acquisitionAmount: z.string().regex(MONEY_DECIMAL),
  annualInsuranceAmount: z.string().regex(MONEY_DECIMAL),
  annualVehicleTaxAmount: z.string().regex(MONEY_DECIMAL),
  averageConsumption: z.string().regex(CONSUMPTION_DECIMAL),
  axleCount: optionalRangedInteger(AXLE_COUNT_MIN, AXLE_COUNT_MAX),
  bodyType: z.enum(MDFE_BODY_TYPES),
  loadingAccess: z.enum(LOADING_ACCESS_KINDS).default('rear'),
  brand: z.string().trim().max(VEHICLE_BRAND_MAX_LENGTH),
  capacityCubicMeters: z.string().regex(MEASURE_DECIMAL),
  capacityKilograms: z.string().regex(MEASURE_DECIMAL),
  cargoHeightMeters: buildCargoDimensionSchema('cargoHeightMeters'),
  cargoLengthMeters: buildCargoDimensionSchema('cargoLengthMeters'),
  cargoWidthMeters: buildCargoDimensionSchema('cargoWidthMeters'),
  color: z.literal('').or(z.enum(VEHICLE_COLORS)),
  fleetNumber: z.string().trim().max(VEHICLE_FLEET_NUMBER_MAX_LENGTH),
  fuelType: z.enum(FUEL_PRODUCTS_TUPLE),
  /** Spec 095 D3: default `false` — sem marcar, o pedágio segue sempre pela tarifa manual. */
  hasAutomaticTollPayment: z.boolean().default(false),
  model: z.string().trim().max(VEHICLE_MODEL_MAX_LENGTH),
  modelYear: optionalRangedInteger(MODEL_YEAR_MIN, MODEL_YEAR_MAX),
  monthlyInstallmentAmount: z.string().regex(MONEY_DECIMAL),
  otherCostsPerKilometer: z.string().regex(COST_PER_KILOMETER_DECIMAL),
  owner: ownerSchema.nullable(),
  ownership: z.enum(FLEET_VEHICLE_OWNERSHIPS),
  plate: z.string().regex(PLATE),
  renavam: optionalDigits(RENAVAM),
  role: z.enum(FLEET_VEHICLE_ROLES),
  secondaryAverageConsumption: z.string().regex(CONSUMPTION_DECIMAL),
  secondaryFuelType: z.literal('').or(z.enum(FUEL_PRODUCTS_TUPLE)),
  state: z.string().regex(STATE),
  tareWeightKilograms: z.string().regex(MEASURE_DECIMAL),
  vehicleType: z.literal('').or(z.enum(VEHICLE_TYPES)),
})

const driverAddressSchema = z
  .object({
    city: z.string().trim().max(DRIVER_CITY_MAX_LENGTH),
    complement: z.string().trim().max(DRIVER_COMPLEMENT_MAX_LENGTH),
    district: z.string().trim().max(DRIVER_DISTRICT_MAX_LENGTH),
    number: z.string().trim().max(DRIVER_ADDRESS_NUMBER_MAX_LENGTH),
    postalCode: optionalDigits(POSTAL_CODE),
    state: z.literal('').or(z.string().regex(STATE)),
    street: z.string().trim().max(DRIVER_STREET_MAX_LENGTH),
  })
  .strict()

/**
 * A coordenada da casa corrigida à mão no mapa da ficha (spec 097 D6).
 *
 * ⚠️ A caixa é a do Brasil continental, a mesma do CHECK do banco: coordenada trocada de ordem cai
 * fora dela e é recusada **na fronteira**, não descoberta no mapa. Meia coordenada não existe — o
 * objeto tem as duas metades ou não vem.
 */
const homeCoordinateSchema = z
  .object({
    latitude: z.coerce.number().min(-34).max(6),
    longitude: z.coerce.number().min(-74).max(-34),
  })
  .strict()
  .transform((value) => ({
    latitude: value.latitude.toFixed(7),
    longitude: value.longitude.toFixed(7),
  }))

const driverFieldsSchema = z.object({
  address: driverAddressSchema,
  anttCategory: z.literal('').or(z.enum(MDFE_OWNER_TAX_REGIMES)),
  /**
   * Spec 100: o motorista amarra a carga com cinta. ⚠️ `default(false)` e não opcional na leitura:
   * ausência é **não amarra**, e supor cinta desenharia pilha alta para quem não amarra.
   */
  securesCargo: z.boolean().default(false),
  licenseCategory: z.literal('').or(z.enum(LICENSE_CATEGORIES)),
  // Teto no Zod, e não em CHECK: `current_date` é função volátil e quebraria o restore do dump
  birthCity: z.string().trim().max(DRIVER_CITY_MAX_LENGTH),
  birthDate: optionalPastDate(),
  birthState: z.literal('').or(z.string().regex(STATE)),
  email: z.literal('').or(z.string().trim().max(EMAIL_MAX_LENGTH).regex(EMAIL)),
  // A primeira habilitação já aconteceu: data futura ali é digitação errada, não cadastro
  fatherName: z.string().trim().max(NAME_MAX_LENGTH),
  firstLicenseAt: optionalPastDate(),
  // O número do RG entra como o estado o imprime, com ponto e traço: só o teto de tamanho é nosso
  identityDocument: z.string().trim().max(IDENTITY_DOCUMENT_MAX_LENGTH),
  identityDocumentIssuer: z.literal('').or(z.enum(IDENTITY_DOCUMENT_ISSUERS)),
  identityDocumentState: z.literal('').or(z.string().regex(STATE)),
  licenseExpiresAt: optionalDate(),
  licenseIssuedCity: z.string().trim().max(DRIVER_CITY_MAX_LENGTH),
  licenseIssuedState: z.literal('').or(z.string().regex(STATE)),
  licenseNumber: optionalDigits(CPF),
  // Mesma forma do residencial: o endereço da empresa do agregado não é um endereço diferente
  linkedAddress: driverAddressSchema,
  linkedLegalName: z.string().trim().max(NAME_MAX_LENGTH),
  linkedTaxId: buildOptionalTaxIdSchema(CNPJ_PATTERN),
  membershipId: z.uuid().nullable(),
  motherName: z.string().trim().max(NAME_MAX_LENGTH),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  nationality: z.string().trim().max(DRIVER_NATIONALITY_MAX_LENGTH),
  phone: optionalDigits(PHONE),
  pixKey: z.string().trim().max(PIX_KEY_MAX_LENGTH),
  pixKeyType: z.literal('').or(z.enum(PIX_KEY_TYPES)),
  rntrc: optionalDigits(RNTRC_INPUT),
  taxId: z.string().regex(CPF),
})

export const plateSchema = z.string().regex(PLATE)

export type DriverAvailabilityQuery = z.infer<typeof driverAvailabilitySchema>
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

/**
 * O vínculo não é campo do POST: ele nasce do usuário que a criação abre. O que o operador escolhe
 * é o perfil desse usuário, e ele sai do corpo antes de a ficha chegar à aplicação.
 */
export const createDriverSchema = driverFieldsSchema
  .omit({ membershipId: true })
  .extend({ profile: z.enum(FLEET_DRIVER_PROFILES) })
  .strict()
  .superRefine(assertDriverRules)

/**
 * A conferência prévia do formulário: cada campo único é opcional aqui, porque ela é consultada
 * enquanto se digita — campo em branco é ausência, não pedido malformado.
 */
export const driverAvailabilitySchema = z
  .object({
    driverId: z.uuid().nullable(),
    email: z.literal('').or(z.string().trim().max(EMAIL_MAX_LENGTH).regex(EMAIL)),
    licenseNumber: optionalDigits(CPF),
    taxId: optionalDigits(CPF),
  })
  .strict()

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
    /**
     * ⚠️ Só na atualização, e não na criação: o mapa que permite mover o alfinete só existe numa
     * ficha que já foi salva e procurada. Aceitá-la na criação seria oferecer a correção de uma
     * coordenada que ainda não existe.
     *
     * Ausente é "não mexeram nela" — a ficha é salva inteira, e omissão não pode apagar o gravado.
     */
    homeCoordinate: homeCoordinateSchema.nullish(),
    status: z.enum(FLEET_DRIVER_STATUSES),
  })
  .strict()
  .superRefine(assertDriverRules)

/** Formato de cada chave Pix por tipo — o Bacen não valida a chave em si, só a forma. */
const PIX_KEY_PATTERNS: Record<Exclude<(typeof PIX_KEY_TYPES)[number], ''>, RegExp> = {
  cnpj: CNPJ_PATTERN,
  cpf: CPF,
  email: EMAIL,
  phone: PHONE,
  random: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
}

function assertDriverRules(
  value: {
    readonly linkedLegalName: string
    readonly linkedTaxId: string
    readonly pixKey: string
    readonly pixKeyType: (typeof PIX_KEY_TYPES)[number] | ''
  },
  context: z.RefinementCtx,
): void {
  // A metade contrária fica solta: ficha antiga tem CNPJ e não tem razão social, e ninguém a inventa
  if (value.linkedLegalName !== '' && value.linkedTaxId === '') {
    context.addIssue({
      code: 'custom',
      message: 'linkedLegalName requires linkedTaxId',
      path: ['linkedLegalName'],
    })
  }
  // As duas metades nascem e somem juntas: chave sem tipo não formata, tipo sem chave não existe
  if ((value.pixKeyType === '') !== (value.pixKey === '')) {
    context.addIssue({
      code: 'custom',
      message: 'pixKeyType requires pixKey and vice-versa',
      path: ['pixKey'],
    })
  } else if (value.pixKeyType !== '' && !PIX_KEY_PATTERNS[value.pixKeyType].test(value.pixKey)) {
    context.addIssue({
      code: 'custom',
      message: 'pixKey does not match pixKeyType format',
      path: ['pixKey'],
    })
  }
}

function assertVehicleRules(value: FleetVehicleFields, context: z.RefinementCtx): void {
  // O tipo é do que traciona: `tpRod` em reboque é rejeição na SEFAZ, e ele sai daqui
  if ((value.role === TRACTION_ROLE) !== (value.vehicleType !== '')) {
    context.addIssue({ code: 'custom', message: 'vehicleType belongs to traction vehicles only' })
  }
  // O grupo <prop> é tudo-ou-nada e proibido quando o veículo é do próprio emitente
  if ((value.ownership === OWN_OWNERSHIP) !== (value.owner === null)) {
    context.addIssue({ code: 'custom', message: 'owner is required unless the vehicle is own' })
  }
  // Produto repetido não é flex: é o mesmo combustível entrando duas vezes na média do R$/km
  if (value.secondaryFuelType !== '' && value.secondaryFuelType === value.fuelType) {
    context.addIssue({
      code: 'custom',
      message: 'secondaryFuelType must differ from fuelType',
      path: ['secondaryFuelType'],
    })
  }
  // Consumo de tanque que não existe é número órfão, e ele puxaria a média para baixo
  if (value.secondaryFuelType === '' && value.secondaryAverageConsumption !== NO_CONSUMPTION) {
    context.addIssue({
      code: 'custom',
      message: 'secondaryAverageConsumption requires a secondaryFuelType',
      path: ['secondaryAverageConsumption'],
    })
  }
}
