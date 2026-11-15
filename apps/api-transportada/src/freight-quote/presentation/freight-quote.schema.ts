/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import type { QuoteAddress } from '../application/freight-quote-by-address.use-case.js'
import { VEHICLE_TYPES } from '../../shared/vehicle-type.constant.js'
import { ANTT_CARGO_TYPES, type AnttCargoTypeCode } from '../domain/antt-floor.constant.js'

/** Até seis casas, sem sinal: o cálculo é em bigint de seis casas, e o banco guarda quatro. */
const DECIMAL = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/

const decimal = z.string().regex(DECIMAL)
const positiveDecimal = decimal.refine((value) => Number.parseFloat(value) > 0, {
  message: 'must be positive',
})
const percent = decimal.refine((value) => Number.parseFloat(value) <= 100, {
  message: 'must be at most 100',
})

const CARGO_CODES = ANTT_CARGO_TYPES.map((entry) => entry.code)

/** `.strict()`: a empresa vem do contexto, e `companyId` no corpo é recusado. */
const settingsSchema = z
  .object({
    adValoremPercent: percent,
    applyAnttFloor: z.boolean(),
    driverCostPerKm: decimal,
    expectedOccupancyPercent: percent.refine((value) => Number.parseFloat(value) > 0, {
      message: 'must be positive',
    }),
    fixedCostPerKm: decimal,
    fuelKmPerLiter: positiveDecimal.nullable(),
    grisPercent: percent,
    maintenanceCostPerKm: decimal,
    marginPercent: percent.refine((value) => Number.parseFloat(value) < 100, {
      message: 'must be below 100',
    }),
    tiresCostPerKm: decimal,
  })
  .strict()

const quoteSchema = z
  .object({
    axles: z.number().int().min(2).max(9),
    cargoType: z
      .number()
      .int()
      .refine((value) => CARGO_CODES.some((code) => code === value)),
    cargoValue: decimal.default('0'),
    distanceKm: positiveDecimal,
    fuelPricePerLitre: positiveDecimal.nullable().default(null),
    highPerformance: z.boolean().default(false),
    shareOfVehiclePercent: positiveDecimal
      .refine((value) => Number.parseFloat(value) <= 100, { message: 'must be at most 100' })
      .default('100'),
    tollAmount: decimal.default('0'),
  })
  .strict()

export type FreightQuoteSettingsBody = z.infer<typeof settingsSchema>
export type FreightQuoteBody = Omit<z.infer<typeof quoteSchema>, 'cargoType'> & {
  readonly cargoType: AnttCargoTypeCode
}

export function parseFreightQuoteSettingsBody(request: Request): Promise<FreightQuoteSettingsBody> {
  return parseBody(settingsSchema, request)
}

export async function parseFreightQuoteBody(request: Request): Promise<FreightQuoteBody> {
  const parsed = await parseBody(quoteSchema, request)
  return { ...parsed, cargoType: parsed.cargoType as AnttCargoTypeCode }
}

const addressSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    /** Aceito para o parceiro reaproveitar o mesmo endereço do pedido; não muda a cotação. */
    complement: z.string().trim().max(120).nullable().optional(),
    cityIbgeCode: z
      .string()
      .regex(/^\d{7}$/)
      .nullable()
      .optional(),
    district: z.string().trim().min(1).max(120),
    number: z.string().trim().min(1).max(20),
    postalCode: z.string().regex(/^\d{8}$/),
    state: z.string().regex(/^[A-Z]{2}$/),
    street: z.string().trim().min(1).max(160),
  })
  .strict()

/**
 * Spec 342: a cotação por endereço. Sem `distanceKm` nem `tollAmount` — os dois saem da estrada
 * medida; `.strict()` recusa quem tentar mandá-los (o parceiro nunca dita a distância).
 */
const quoteByAddressSchema = z
  .object({
    axles: z.number().int().min(2).max(9),
    cargoType: z
      .number()
      .int()
      .refine((value) => CARGO_CODES.some((code) => code === value)),
    cargoValue: decimal.default('0'),
    destination: addressSchema,
    fuelPricePerLitre: positiveDecimal.nullable().default(null),
    highPerformance: z.boolean().default(false),
    origin: addressSchema,
    shareOfVehiclePercent: positiveDecimal
      .refine((value) => Number.parseFloat(value) <= 100, { message: 'must be at most 100' })
      .default('100'),
    vehicleType: z.enum(VEHICLE_TYPES).default('truck'),
  })
  .strict()

export type FreightQuoteByAddressBody = Omit<
  z.infer<typeof quoteByAddressSchema>,
  'cargoType' | 'destination' | 'origin'
> & {
  readonly cargoType: AnttCargoTypeCode
  readonly destination: QuoteAddress
  readonly origin: QuoteAddress
}

export async function parseFreightQuoteByAddressBody(
  request: Request,
): Promise<FreightQuoteByAddressBody> {
  const parsed = await parseBody(quoteByAddressSchema, request)
  return {
    ...parsed,
    cargoType: parsed.cargoType as AnttCargoTypeCode,
    destination: { ...parsed.destination, cityIbgeCode: parsed.destination.cityIbgeCode ?? null },
    origin: { ...parsed.origin, cityIbgeCode: parsed.origin.cityIbgeCode ?? null },
  }
}
