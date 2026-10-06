/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, parseBody, readListQuery } from '../../http/request-parsing.service.js'
import {
  LOCATION_RETENTION_MAX_DAYS,
  LOCATION_RETENTION_MIN_DAYS,
} from '../../shared/location-retention.constant.js'
import { isValidRetentionDays } from '../domain/location-retention.policy.js'

const DIGITS_ONLY = /^\d+$/
const IMPACT_QUERY_KEYS: ReadonlySet<string> = new Set(['retentionDays'])

/** `.strict()`: a empresa vem do contexto, e `companyId` ou a data de início no corpo são recusados. */
const locationRetentionSettingsSchema = z
  .object({
    purgeEnabled: z.boolean(),
    retentionDays: z
      .number()
      .int()
      .min(LOCATION_RETENTION_MIN_DAYS)
      .max(LOCATION_RETENTION_MAX_DAYS),
  })
  .strict()

export function parseLocationRetentionSettingsBody(
  request: Request,
): Promise<z.infer<typeof locationRetentionSettingsSchema>> {
  return parseBody(locationRetentionSettingsSchema, request)
}

export function parseLocationRetentionImpactQuery(request: Request): {
  readonly retentionDays: number
} {
  const parameters = readListQuery(new URL(request.url), IMPACT_QUERY_KEYS)
  const raw = parameters.get('retentionDays')
  const retentionDays = raw !== null && DIGITS_ONLY.test(raw) ? Number(raw) : undefined
  if (!isValidRetentionDays(retentionDays)) {
    throw invalidRequest([
      { field: 'retentionDays', message: 'must be an integer between 30 and 90' },
    ])
  }
  return { retentionDays }
}
