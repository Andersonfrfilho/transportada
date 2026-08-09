/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

export type ActivateInvitationRequest = {
  readonly code: string
  readonly password: string
}

const activateInvitationSchema = z
  .object({
    code: z.string().trim().min(1),
    password: z.string().min(1),
  })
  .strict()

export function parseActivateInvitationRequest(body: unknown): ActivateInvitationRequest {
  const result = activateInvitationSchema.safeParse(body)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}
