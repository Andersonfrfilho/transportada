/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { ApiError } from '../shared/api.error'
import { CORRELATION_ID_PATTERN, HTTP_ERROR } from '../shared/api.constant'

const requestMetadataSchema = z.object({
  contentLength: z.string().regex(/^\d+$/).transform(Number).optional(),
  method: z
    .string()
    .regex(/^[A-Z]+$/)
    .max(16),
  pathname: z.string().startsWith('/').max(2_048),
})

const correlationIdSchema = z.string().trim().regex(CORRELATION_ID_PATTERN)

export type RequestMetadata = z.infer<typeof requestMetadataSchema>

export function parseRequestMetadata(value: unknown): RequestMetadata {
  const result = requestMetadataSchema.safeParse(value)
  if (!result.success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return result.data
}

export function parseCorrelationId(value: unknown): string | undefined {
  const result = correlationIdSchema.safeParse(value)
  return result.success ? result.data : undefined
}
