/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  CTE_CHARGE_CALCULATION_TYPES,
  CTE_EMISSION_GROUPING_MODES,
  CTE_EMISSION_MATCH_ROLES,
  CTE_EMISSION_PROFILE_MATCH_MODES,
  CTE_ICMS_CSTS,
  CTE_MODALS,
  CTE_PICKUP_INDICATORS,
  CTE_PREDOMINANT_PRODUCT_MODES,
  CTE_RECEIVER_IE_INDICATORS,
  CTE_SERVICE_TYPES,
  CTE_TAKERS,
  PICKUP_DETAILS_MAX_LENGTH,
} from '../../database/cte-emission-profile.schema.js'

const CFOP = /^[0-9]{4}$/
const COUNTER = /^(?:0|[1-9][0-9]{0,3})$/
const FIXED_AMOUNT = 'fixed_amount'
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/
const OPERATION_NATURE_MAX_LENGTH = 60
const RECEIVER_PICKUP_AT_DESTINATION = '0'
const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const PREDOMINANT_PRODUCT_FIXED = 'fixed'
const RATE_DECIMAL = /^(?:0\.[0-9]{6}|1\.000000)$/
const TAX_ID = /^(?:[0-9]{8}|[0-9]{14})$/

const componentSchema = z
  .object({
    amount: z.string().regex(MONEY_DECIMAL).nullable(),
    calculationType: z.enum(CTE_CHARGE_CALCULATION_TYPES),
    label: z.string().trim().min(1).max(100),
    ordinal: z.string().regex(POSITIVE_BIGINT),
    rate: z.string().regex(RATE_DECIMAL).nullable(),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
  })
  .strict()
  .refine((component) =>
    component.calculationType === FIXED_AMOUNT
      ? component.amount !== null && component.rate === null
      : component.rate !== null && component.amount === null,
  )
  .refine(
    (component) =>
      component.validUntil === null ||
      Date.parse(component.validUntil) >= Date.parse(component.validFrom),
  )

const matcherSchema = z
  .object({
    matchRole: z.enum(CTE_EMISSION_MATCH_ROLES),
    taxId: z.string().regex(TAX_ID),
  })
  .strict()

const settingsSchema = z
  .object({
    cargoInsuranceDeclared: z.boolean(),
    cfopInternal: z.string().regex(CFOP),
    cfopInterstate: z.string().regex(CFOP),
    chargeComponentLabel: z.string().trim().min(1).max(100),
    deliveryDays: z.string().regex(COUNTER),
    groupingMode: z.enum(CTE_EMISSION_GROUPING_MODES),
    icmsBaseReductionRate: z.string().regex(RATE_DECIMAL),
    icmsCst: z.enum(CTE_ICMS_CSTS),
    icmsRate: z.string().regex(RATE_DECIMAL),
    matchMode: z.enum(CTE_EMISSION_PROFILE_MATCH_MODES),
    modal: z.enum(CTE_MODALS),
    name: z.string().trim().min(2).max(100),
    observations: z.string().max(500),
    operationNature: z.string().trim().min(1).max(OPERATION_NATURE_MAX_LENGTH),
    pickupDetails: z.string().trim().max(PICKUP_DETAILS_MAX_LENGTH),
    pickupIndicator: z.enum(CTE_PICKUP_INDICATORS),
    predominantProductMode: z.enum(CTE_PREDOMINANT_PRODUCT_MODES),
    predominantProductName: z.string().trim().max(120),
    priority: z.string().regex(POSITIVE_BIGINT),
    receiverIeIndicator: z.enum(CTE_RECEIVER_IE_INDICATORS),
    serviceType: z.enum(CTE_SERVICE_TYPES),
    taker: z.enum(CTE_TAKERS),
  })
  .strict()
  .refine(hasCoherentPredominantProduct)
  .refine(hasCoherentPickupDetails)

const freightRuleSchema = z
  .object({
    maximumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    minimumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    percentage: z.string().regex(RATE_DECIMAL),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
  })
  .strict()
  .refine(
    (rule) => rule.validUntil === null || Date.parse(rule.validUntil) >= Date.parse(rule.validFrom),
  )

const profileBodySchema = z
  .object({
    components: z.array(componentSchema).max(50).refine(hasUniqueOrdinals),
    freightRule: freightRuleSchema,
    matchers: z.array(matcherSchema).max(200).refine(hasUniqueMatchers),
    settings: settingsSchema,
  })
  .strict()

export const createProfileSchema = profileBodySchema

export const updateProfileSchema = profileBodySchema
  .extend({ expectedVersion: z.string().regex(POSITIVE_BIGINT) })
  .strict()

export const changeProfileStatusSchema = z
  .object({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    status: z.enum(['active', 'inactive']),
  })
  .strict()

function hasCoherentPredominantProduct(settings: {
  readonly predominantProductMode: string
  readonly predominantProductName: string
}): boolean {
  const isFixed = settings.predominantProductMode === PREDOMINANT_PRODUCT_FIXED
  const hasName = settings.predominantProductName.length > 0
  return isFixed === hasName
}

function hasCoherentPickupDetails(settings: {
  readonly pickupDetails: string
  readonly pickupIndicator: string
}): boolean {
  return (
    settings.pickupIndicator === RECEIVER_PICKUP_AT_DESTINATION ||
    settings.pickupDetails.length === 0
  )
}

function hasUniqueMatchers(matchers: readonly z.infer<typeof matcherSchema>[]): boolean {
  const keys = matchers.map((matcher) => `${matcher.matchRole}:${matcher.taxId}`)
  return new Set(keys).size === keys.length
}

function hasUniqueOrdinals(components: readonly z.infer<typeof componentSchema>[]): boolean {
  const ordinals = components.map((component) => component.ordinal)
  return new Set(ordinals).size === ordinals.length
}
