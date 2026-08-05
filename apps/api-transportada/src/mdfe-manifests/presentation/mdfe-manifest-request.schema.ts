/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  MDFE_CARGO_TYPES,
  MDFE_CARGO_UNITS,
  MDFE_EMITTER_TYPES,
  MDFE_TRANSPORTER_TYPES,
} from '../../database/mdfe.schema.js'

/** Um manifesto não carrega mais CT-e do que o layout aceita em infDoc. */
const MAX_DOCUMENTS_PER_MANIFEST = 1000
const MAX_DRIVERS_PER_MANIFEST = 10
const ADDITIONAL_INFORMATION_MAX_LENGTH = 2000
const CARGO_PRODUCT_MAX_LENGTH = 120
const CONTRACTOR_NAME_MAX_LENGTH = 60
const ENDORSEMENT_MAX_LENGTH = 40
const NCM = /^[0-9]{8}$/
const OPTIONAL_STATE = /^(?:[A-Z]{2})?$/
const POSTAL_CODE = /^[0-9]{8}$/
const TAX_ID = /^(?:[0-9]{11}|[0-9]{14})$/
const DECIMAL_AMOUNT = /^[0-9]{1,13}\.[0-9]{2}$/

export const previewManifestSchema = z
  .object({
    documentIds: z.array(z.uuid()).min(1).max(MAX_DOCUMENTS_PER_MANIFEST),
  })
  .strict()

export type PreviewManifestBody = z.infer<typeof previewManifestSchema>

export const createManifestSchema = z
  .object({
    additionalInformation: z.string().max(ADDITIONAL_INFORMATION_MAX_LENGTH).default(''),
    cargoProduct: z.string().max(CARGO_PRODUCT_MAX_LENGTH).default(''),
    cargoProductNcm: z.union([z.literal(''), z.string().regex(NCM)]).default(''),
    cargoType: z.union([z.literal(''), z.enum(MDFE_CARGO_TYPES)]).default(''),
    cargoUnit: z.enum(MDFE_CARGO_UNITS).default('01'),
    contractorName: z.string().max(CONTRACTOR_NAME_MAX_LENGTH).default(''),
    contractorTaxId: z.union([z.literal(''), z.string().regex(TAX_ID)]).default(''),
    destinationState: z.string().regex(OPTIONAL_STATE).default(''),
    dischargePostalCode: z.union([z.literal(''), z.string().regex(POSTAL_CODE)]).default(''),
    documentIds: z.array(z.uuid()).min(1).max(MAX_DOCUMENTS_PER_MANIFEST),
    driverIds: z.array(z.uuid()).min(1).max(MAX_DRIVERS_PER_MANIFEST),
    emitterType: z.enum(MDFE_EMITTER_TYPES).default('1'),
    freightValue: z.string().regex(DECIMAL_AMOUNT).default('0.00'),
    insuranceEndorsement: z.string().max(ENDORSEMENT_MAX_LENGTH).default(''),
    loadingPostalCode: z.union([z.literal(''), z.string().regex(POSTAL_CODE)]).default(''),
    transporterType: z.union([z.literal(''), z.enum(MDFE_TRANSPORTER_TYPES)]).default(''),
    tripStartedAt: z.iso.datetime().nullable().default(null),
    vehicleId: z.uuid(),
  })
  .strict()

export type CreateManifestBody = z.infer<typeof createManifestSchema>

/** Nasce de uma viagem: motoristas e veículo vêm da viagem, não do corpo da requisição (spec 027, T009). */
export const createTripManifestSchema = createManifestSchema.omit({
  driverIds: true,
  vehicleId: true,
})

export type CreateTripManifestBody = z.infer<typeof createTripManifestSchema>
