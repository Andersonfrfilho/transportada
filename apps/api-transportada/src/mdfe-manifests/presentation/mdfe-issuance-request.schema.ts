/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

/** Limites da tag xJust do evento 110111 de cancelamento. */
const CANCELLATION_JUSTIFICATION_MIN_LENGTH = 15
const CANCELLATION_JUSTIFICATION_MAX_LENGTH = 255
const IBGE_CITY_CODE = /^[0-9]{7}$/
const STATE = /^[A-Z]{2}$/

export const issueManifestSchema = z.object({}).strict()

export const closeManifestSchema = z
  .object({
    closureCityCode: z.string().regex(IBGE_CITY_CODE),
    closureState: z.string().regex(STATE),
  })
  .strict()

export type CloseManifestBody = z.infer<typeof closeManifestSchema>

export const cancelManifestSchema = z
  .object({
    justification: z
      .string()
      .trim()
      .min(CANCELLATION_JUSTIFICATION_MIN_LENGTH)
      .max(CANCELLATION_JUSTIFICATION_MAX_LENGTH),
  })
  .strict()

export type CancelManifestBody = z.infer<typeof cancelManifestSchema>
