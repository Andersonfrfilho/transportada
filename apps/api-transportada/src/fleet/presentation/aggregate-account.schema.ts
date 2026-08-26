/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { assertJsonContentType, parseJson, readBoundedRequestBody } from '../../shared/request-body.service.js'
import { normalizeTaxId, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type { RegisterAggregateAccountInput } from '../application/aggregate-account.use-case.js'

const MAX_TEXT_LENGTH = 200
const MIN_PASSWORD_LENGTH = 8
const requiredText = z.string().trim().min(1).max(MAX_TEXT_LENGTH)

const registerSchema = z
  .object({
    email: requiredText.email(),
    name: requiredText,
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_TEXT_LENGTH),
    taxId: z.string().transform(normalizeTaxId).pipe(z.string().regex(TAX_ID_PATTERN)),
  })
  .strict()

export async function parseRegisterAggregateAccountRequest(
  request: Request,
): Promise<Omit<RegisterAggregateAccountInput, 'ipAddress'>> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = registerSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}
