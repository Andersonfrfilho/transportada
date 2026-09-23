/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { COMPANY_ENTRY_KIND_SIDES } from '../../database/trip-financial.schema.js'

const createCompanyEntryKindSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    side: z.enum(COMPANY_ENTRY_KIND_SIDES),
  })
  .strict()

export function parseCreateCompanyEntryKindRequest(request: Request): Promise<{
  readonly name: string
  readonly side: (typeof COMPANY_ENTRY_KIND_SIDES)[number]
}> {
  return parseBody(createCompanyEntryKindSchema, request)
}
