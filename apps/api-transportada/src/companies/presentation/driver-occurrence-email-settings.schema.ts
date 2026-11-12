/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** `.strict()`: a empresa vem do contexto, e `companyId` no corpo é recusado. */
const driverOccurrenceEmailSettingsSchema = z.object({ enabled: z.boolean() }).strict()

export function parseDriverOccurrenceEmailSettingsBody(
  request: Request,
): Promise<z.infer<typeof driverOccurrenceEmailSettingsSchema>> {
  return parseBody(driverOccurrenceEmailSettingsSchema, request)
}
