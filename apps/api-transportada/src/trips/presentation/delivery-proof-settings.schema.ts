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

export type DeliveryProofSettingsBody = z.infer<typeof deliveryProofSettingsSchema>
export type DeliveryProofOverridesBody = z.infer<typeof deliveryProofOverridesSchema>
