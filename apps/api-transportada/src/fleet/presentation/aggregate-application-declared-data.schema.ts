/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  FLEET_VEHICLE_ROLES,
  MDFE_BODY_TYPES,
  MDFE_OWNER_TAX_REGIMES,
} from '../../database/fleet.schema.js'
import { FUEL_PRODUCTS } from '../../shared/fuel.constant.js'
import { IDENTITY_DOCUMENT_ISSUERS } from '../../shared/identity-document-issuer.constant.js'
import { LICENSE_CATEGORIES } from '../../shared/license-category.constant.js'
import { PIX_KEY_TYPES } from '../../shared/pix-key-type.constant.js'
import { RNTRC_INPUT } from '../../shared/rntrc.service.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'
import { VEHICLE_TYPES } from '../../shared/vehicle-type.constant.js'

const MAX_TEXT_LENGTH = 200
const optionalText = z.string().trim().max(MAX_TEXT_LENGTH).optional()
const optionalDate = z.string().date().optional()
/** A UF é texto livre no banco (sem CHECK) — o mesmo relaxamento vale aqui. */
const optionalState = z.string().trim().toUpperCase().max(2).optional()

/**
 * A candidatura é a única fronteira onde a maior parte destes campos ainda pode faltar de
 * propósito: ela é o que a landing captura sem exigir documento nenhum, e quem decide se o que
 * falta impede a aprovação é o operador (T006), não um `400` no meio do pré-cadastro.
 */
const declaredAddressSchema = z
  .object({
    city: optionalText,
    complement: optionalText,
    district: optionalText,
    number: optionalText,
    postalCode: optionalText,
    state: optionalState,
    street: optionalText,
  })
  .partial()

const declaredDriverSchema = z
  .object({
    address: declaredAddressSchema.optional(),
    anttCategory: z.enum(MDFE_OWNER_TAX_REGIMES).optional(),
    birthCity: optionalText,
    birthDate: optionalDate,
    birthState: optionalState,
    fatherName: optionalText,
    firstLicenseAt: optionalDate,
    identityDocument: optionalText,
    identityDocumentIssuer: z.enum(IDENTITY_DOCUMENT_ISSUERS).optional(),
    identityDocumentState: optionalState,
    licenseCategory: z.enum(LICENSE_CATEGORIES).optional(),
    licenseExpiresAt: optionalDate,
    licenseIssuedCity: optionalText,
    licenseIssuedState: optionalState,
    licenseNumber: optionalText,
    linkedAddress: declaredAddressSchema.optional(),
    linkedLegalName: optionalText,
    linkedTaxId: z
      .string()
      .trim()
      .transform(normalizeTaxId)
      .refine((value) => value === '' || /^[A-Z0-9]{12}[0-9]{2}$/u.test(value))
      .optional(),
    motherName: optionalText,
    nationality: optionalText,
    pixKey: optionalText,
    pixKeyType: z.enum(PIX_KEY_TYPES).optional(),
    rntrc: z
      .string()
      .trim()
      .refine((value) => value === '' || RNTRC_INPUT.test(value))
      .optional(),
  })
  .partial()

const declaredVehicleSchema = z
  .object({
    axleCount: z.number().int().min(0).max(20).optional(),
    bodyType: z.enum(MDFE_BODY_TYPES).optional(),
    brand: optionalText,
    capacityCubicMeters: optionalText,
    capacityKilograms: optionalText,
    color: optionalText,
    fuelType: z.enum(FUEL_PRODUCTS).optional(),
    model: optionalText,
    modelYear: z.number().int().min(1900).max(2100).optional(),
    plate: optionalText,
    renavam: optionalText,
    role: z.enum(FLEET_VEHICLE_ROLES).optional(),
    state: optionalState,
    tareWeightKilograms: optionalText,
    vehicleType: z.enum(VEHICLE_TYPES).optional(),
  })
  .partial()

export const aggregateApplicationDeclaredDataSchema = z
  .object({
    driver: declaredDriverSchema.optional(),
    vehicle: declaredVehicleSchema.optional(),
  })
  .partial()

export type AggregateApplicationDeclaredDriver = z.infer<typeof declaredDriverSchema>
export type AggregateApplicationDeclaredVehicle = z.infer<typeof declaredVehicleSchema>
export type AggregateApplicationDeclaredData = z.infer<
  typeof aggregateApplicationDeclaredDataSchema
>
