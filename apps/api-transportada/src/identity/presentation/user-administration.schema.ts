/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { COMPANY_ROLES } from '../../database/identity.schema.js'
import { CONTACT_CHANNELS } from '../../database/identity-user-profile.schema.js'
import {
  parseBody,
  readListQuery,
  readPaging,
  type Paging,
} from '../../http/request-parsing.service.js'
import { COMPANY_USER_API_STATUSES } from '../application/change-company-user-status.use-case.js'

const COMPANY_USER_LIST_QUERY_KEYS = new Set(['cursor', 'limit'])

export const inviteCompanyUserSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS),
    contact: z.string().min(1),
    name: z.string().min(1),
    roles: z.array(z.enum(COMPANY_ROLES)).min(1),
  })
  .strict()
export type InviteCompanyUserBody = z.infer<typeof inviteCompanyUserSchema>

export const changeCompanyUserStatusSchema = z
  .object({ status: z.enum(COMPANY_USER_API_STATUSES) })
  .strict()
export type ChangeCompanyUserStatusBody = z.infer<typeof changeCompanyUserStatusSchema>

/** Login do Keycloak: minúsculo, sem espaço e sem acento — o que o realm aceita sem normalizar. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,59}$/u

export const updateCompanyUserProfileSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS).optional(),
    contact: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    name: z.string().trim().min(1).optional(),
    username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN).optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided.',
  })
export type UpdateCompanyUserProfileBody = z.infer<typeof updateCompanyUserProfileSchema>

export const replaceCompanyUserRolesSchema = z
  .object({ roles: z.array(z.enum(COMPANY_ROLES)).min(1) })
  .strict()
export type ReplaceCompanyUserRolesBody = z.infer<typeof replaceCompanyUserRolesSchema>

export async function parseInviteCompanyUserRequest(
  request: Request,
): Promise<InviteCompanyUserBody> {
  return parseBody(inviteCompanyUserSchema, request)
}

export async function parseChangeCompanyUserStatusRequest(
  request: Request,
): Promise<ChangeCompanyUserStatusBody> {
  return parseBody(changeCompanyUserStatusSchema, request)
}

export async function parseUpdateCompanyUserProfileRequest(
  request: Request,
): Promise<UpdateCompanyUserProfileBody> {
  return parseBody(updateCompanyUserProfileSchema, request)
}

export async function parseReplaceCompanyUserRolesRequest(
  request: Request,
): Promise<ReplaceCompanyUserRolesBody> {
  return parseBody(replaceCompanyUserRolesSchema, request)
}

export function parseCompanyUserListQuery(url: URL): Paging {
  return readPaging(readListQuery(url, COMPANY_USER_LIST_QUERY_KEYS))
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
