/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { LANDING_ACCENT_COLOR_PATTERN } from '../../database/landing.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import type { LandingSettingsWriteRequest } from '../application/landing-settings.use-case.js'

const MAX_TEXT_LENGTH = 500
const optionalText = z
  .string()
  .max(MAX_TEXT_LENGTH)
  .optional()
  .transform((value) => (value === '' ? undefined : value))

const landingSettingsSchema = z
  .object({
    accentColor: z.string().regex(LANDING_ACCENT_COLOR_PATTERN).optional(),
    brandName: optionalText,
    contactEmail: optionalText,
    contactPhone: optionalText,
    sections: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

export async function parseLandingSettingsRequest(
  request: Request,
): Promise<LandingSettingsWriteRequest> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = landingSettingsSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return {
    accentColor: result.data.accentColor,
    brandName: result.data.brandName,
    contactEmail: result.data.contactEmail,
    contactPhone: result.data.contactPhone,
    sections: result.data.sections,
  }
}
