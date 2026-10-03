/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0094 §5: o `PUT` exige todas as chaves (`null` explícito onde não há regra) e recusa chave
 * desconhecida — inclusive `companyId`, que vem do contexto.
 */
import { z } from 'zod'

import {
  ARRIVAL_REFERENCE_PATTERN_ISSUE_MESSAGES,
  findArrivalReferencePatternIssue,
} from '../domain/arrival-reference-pattern.policy.js'
import {
  PREVIEW_ITEM_FIELDS,
  PREVIEW_REQUIRED_FIELDS,
  RECEIVING_PROFILE_LIMITS as LIMITS,
} from '../domain/contractor-receiving-profile.constant.js'
import { normalizePreviewColumnName } from '../domain/preview-column-name.policy.js'

const HUNDREDTHS = 100

const boundedInteger = (range: { readonly max: number; readonly min: number }) =>
  z.number().int().min(range.min).max(range.max)

const arrivalReferencePatternSchema = z
  .string()
  .min(1)
  .max(LIMITS.arrivalReferencePatternMaxLength)
  .superRefine((pattern, context) => {
    if (pattern.length > LIMITS.arrivalReferencePatternMaxLength) return
    const issue = findArrivalReferencePatternIssue(pattern)
    if (issue !== undefined) {
      context.addIssue({ code: 'custom', message: ARRIVAL_REFERENCE_PATTERN_ISSUE_MESSAGES[issue] })
    }
  })

const previewColumnMapSchema = z
  .partialRecord(
    z.enum(PREVIEW_ITEM_FIELDS),
    z.string().trim().min(1).max(LIMITS.previewColumnNameMaxLength),
  )
  .superRefine((columnMap, context) => {
    const seen = new Set<string>()
    for (const [field, columnName] of Object.entries(columnMap)) {
      const normalized = normalizePreviewColumnName(columnName)
      if (seen.has(normalized)) {
        context.addIssue({ code: 'custom', message: 'Column is already mapped', path: [field] })
      }
      seen.add(normalized)
    }
  })

const weightTolerancePercentSchema = z
  .number()
  .min(LIMITS.weightTolerancePercent.min)
  .max(LIMITS.weightTolerancePercent.max)
  .refine((value) => Number.isInteger(Number((value * HUNDREDTHS).toFixed(6))), {
    message: 'Use at most two decimal places',
  })

export const contractorReceivingProfileSchema = z
  .object({
    arrivalReferencePattern: arrivalReferencePatternSchema.nullable(),
    deliveryDeadlineBusinessDays: boundedInteger(LIMITS.deliveryDeadlineBusinessDays).nullable(),
    isEnabled: z.boolean(),
    matchWindowDays: boundedInteger(LIMITS.matchWindowDays),
    previewColumnMap: previewColumnMapSchema.nullable(),
    previewEnabled: z.boolean(),
    previewSheetName: z.string().trim().min(1).max(LIMITS.previewSheetNameMaxLength).nullable(),
    requiresDamageCheck: z.boolean(),
    separationWindowHours: boundedInteger(LIMITS.separationWindowHours).nullable(),
    weightTolerancePercent: weightTolerancePercentSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (!profile.previewEnabled) return
    const mapped = new Set(Object.keys(profile.previewColumnMap ?? {}))
    const missing = PREVIEW_REQUIRED_FIELDS.filter((field) => !mapped.has(field))
    if (missing.length === 0) return
    context.addIssue({
      code: 'custom',
      message: `Preview requires the columns of: ${missing.join(', ')}`,
      path: ['previewColumnMap'],
    })
  })
