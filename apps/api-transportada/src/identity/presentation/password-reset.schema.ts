/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

export type RequestPasswordResetRequest = {
  readonly username: string
}

export type ConfirmPasswordResetRequest = {
  readonly code: string
  readonly password: string
}

const requestPasswordResetSchema = z
  .object({
    username: z.string().trim().min(1),
  })
  .strict()

const confirmPasswordResetSchema = z
  .object({
    code: z.string().trim().min(1),
    password: z.string().min(1),
  })
  .strict()

export function parseRequestPasswordResetRequest(body: unknown): RequestPasswordResetRequest {
  const result = requestPasswordResetSchema.safeParse(body)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

export function parseConfirmPasswordResetRequest(body: unknown): ConfirmPasswordResetRequest {
  const result = confirmPasswordResetSchema.safeParse(body)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}
