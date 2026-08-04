/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { BootstrapAdministratorInput } from '../application/bootstrap-first-admin.port.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128
const PASSWORD_HAS_LETTER = /[A-Za-z]/
const PASSWORD_HAS_DIGIT = /\d/
const USERNAME = /^[A-Za-z0-9._-]{3,60}$/

const administratorSchema = z
  .object({
    email: z.string().trim().email().max(254),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH)
      .max(PASSWORD_MAX_LENGTH)
      .refine((value) => PASSWORD_HAS_LETTER.test(value) && PASSWORD_HAS_DIGIT.test(value)),
    username: z.string().regex(USERNAME),
  })
  .strict()

export function parseBootstrapFirstAdminRequest(body: unknown): BootstrapAdministratorInput {
  const result = administratorSchema.safeParse(body)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}
