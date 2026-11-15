/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
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
