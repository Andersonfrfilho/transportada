/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { FREIGHT_REGION_STATUSES } from '../../database/freight-region.schema.js'
import { FREIGHT_VEHICLE_CLASSES } from '../../shared/freight-class.constant.js'
import { REGION_CODE_PATTERN, normalizeRegionCity } from '../domain/region-coverage.policy.js'

const CITY_MAX_LENGTH = 60
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
const NAME_MAX_LENGTH = 120
const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const STATE = /^[A-Z]{2}$/

/** UF chega da planilha do cliente em qualquer caixa; canonicalizar antes de conferir é o que o
 * CHECK da tabela espera, e recusar `sp` seria recusar a linha certa pelo motivo errado. */
const stateSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => STATE.test(value), 'state must be a two letter UF')

const citySchema = z
  .object({
    city: z.string().trim().min(1).max(CITY_MAX_LENGTH),
    state: stateSchema,
  })
  .strict()

const rateSchema = z
  .object({
    driverAmount: z.string().regex(MONEY_DECIMAL),
    freightClass: z.enum(FREIGHT_VEHICLE_CLASSES),
  })
  .strict()

/**
 * A zona não entra aqui de propósito: ela sai do código impresso no mapper. Uma rota `1.002`
 * cadastrada como zona 1 não contradiz constraint nenhuma e passa a valer como preço.
 */
const regionFieldsSchema = z.object({
  cities: z
    .array(citySchema)
    .refine(
      (value) =>
        new Set(value.map((entry) => `${normalizeRegionCity(entry.city)}/${entry.state}`)).size ===
        value.length,
      'cities must be unique',
    ),
  code: z.string().regex(REGION_CODE_PATTERN),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  rates: z
    .array(rateSchema)
    .refine(
      (value) => new Set(value.map((entry) => entry.freightClass)).size === value.length,
      'rates must be unique per freight class',
    ),
})

export type FreightRegionFields = z.infer<typeof regionFieldsSchema>

export type UpdateFreightRegionBody = FreightRegionFields & {
  readonly expectedVersion: string
  readonly status: (typeof FREIGHT_REGION_STATUSES)[number]
}

export const createRegionSchema = regionFieldsSchema.strict()

export const updateRegionSchema = regionFieldsSchema
  .extend({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    status: z.enum(FREIGHT_REGION_STATUSES),
  })
  .strict()
