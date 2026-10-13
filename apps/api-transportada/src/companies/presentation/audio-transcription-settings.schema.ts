/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** `.strict()`: a empresa vem do contexto, e `companyId` ou data de início no corpo são recusados. */
const audioTranscriptionSettingsSchema = z.object({ enabled: z.boolean() }).strict()

export function parseAudioTranscriptionSettingsBody(
  request: Request,
): Promise<z.infer<typeof audioTranscriptionSettingsSchema>> {
  return parseBody(audioTranscriptionSettingsSchema, request)
}
