/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import { normalizeTaxId, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type { SubmitAggregateApplicationInput } from '../application/aggregate-applications.use-case.js'
import { aggregateApplicationDeclaredDataSchema } from './aggregate-application-declared-data.schema.js'

const MAX_TEXT_LENGTH = 200
const requiredText = z.string().trim().min(1).max(MAX_TEXT_LENGTH)
const UUID = z.string().uuid()

const submitSchema = z
  .object({
    companyId: UUID,
    declaredData: aggregateApplicationDeclaredDataSchema.default({}),
    email: requiredText,
    name: requiredText,
    phone: requiredText,
    taxId: z.string().transform(normalizeTaxId).pipe(z.string().regex(TAX_ID_PATTERN)),
    // Vazio por padrão: sem TURNSTILE_SECRET_KEY configurado (dev local) a rota não verifica nada,
    // e exigir o campo quebraria o formulário público de quem ainda não integrou o widget.
    turnstileToken: z.string().trim().default(''),
  })
  .strict()

export type SubmitAggregateApplicationRequest = SubmitAggregateApplicationInput &
  Readonly<{ turnstileToken: string }>

export async function parseSubmitAggregateApplicationRequest(
  request: Request,
): Promise<SubmitAggregateApplicationRequest> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = submitSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

const rejectSchema = z.object({ rejectionReason: requiredText }).strict()

export async function parseRejectAggregateApplicationRequest(request: Request): Promise<string> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = rejectSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data.rejectionReason
}

export function parseAggregateApplicationId(
  pathParameters: Readonly<Record<string, string>>,
): string {
  return parseUuidPathIdentifier(pathParameters.id ?? '')
}
