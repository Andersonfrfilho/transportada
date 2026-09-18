/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { DELIVERY_PROOF_FIELD_MODES } from '../domain/delivery-proof-settings.policy.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { TAX_ID_PATTERN } from '../../shared/tax-id.service.js'

const fieldMode = z.enum(DELIVERY_PROOF_FIELD_MODES)

export const deliveryProofSettingsSchema = z
  .object({
    photo: fieldMode,
    receiverDocument: fieldMode,
    receiverName: fieldMode,
    signature: fieldMode,
  })
  .strict()

/** O corpo do `PUT` de exceções é o conjunto inteiro — o que não veio sai. */
export const deliveryProofOverridesSchema = z
  .object({
    overrides: z
      .array(
        deliveryProofSettingsSchema.extend({ taxId: buildTaxIdSchema(TAX_ID_PATTERN) }).strict(),
      )
      .max(200),
  })
  .strict()

/** ADR-0068 §7, spec 157 RF7: as faixas do painel — fora delas é `400 invalidRequest`. */
export const deliveryProofPunctualitySettingsSchema = z
  .object({
    proofWindowMinutes: z.number().int().min(5).max(1440),
    proofRadiusMeters: z.number().int().min(50).max(5000),
    latePenaltyPoints: z.number().int().min(0).max(100),
    missingPenaltyPoints: z.number().int().min(0).max(100),
    missingAfterHours: z.number().int().min(1).max(168),
  })
  .strict()

/**
 * O corpo do `PUT` da configuração geral: os quatro modos + os cinco parâmetros da nota do
 * motorista (ADR-0068). A exceção por CNPJ continua com `deliveryProofSettingsSchema` sozinho.
 *
 * ADR-0069 §6: o interruptor da leitura do canhoto é da configuração geral, nunca da exceção, e é
 * opcional — ausente é "não mexe".
 */
export const companyDeliveryProofSettingsSchema = z
  .object({
    ...deliveryProofSettingsSchema.shape,
    ...deliveryProofPunctualitySettingsSchema.shape,
    canhotoOcrEnabled: z.boolean().optional(),
  })
  .strict()

export type DeliveryProofSettingsBody = z.infer<typeof deliveryProofSettingsSchema>
export type DeliveryProofOverridesBody = z.infer<typeof deliveryProofOverridesSchema>
export type CompanyDeliveryProofSettingsBody = z.infer<typeof companyDeliveryProofSettingsSchema>
