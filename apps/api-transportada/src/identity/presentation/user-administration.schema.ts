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

/** `membership_roles` tem PK `(membership_id, role)`: papel repetido viraria 500 na escrita. */
function buildCompanyRolesSchema() {
  return z
    .array(z.enum(COMPANY_ROLES))
    .min(1)
    .transform((roles) => [...new Set(roles)])
}

/**
 * A tela digita com máscara (`123.456.789-09`, `(11) 98888-7777`) e o banco guarda só dígitos —
 * normalizar aqui evita que cada chamador precise lembrar de limpar, e que a mesma pessoa entre
 * duas vezes só porque um formulário mandou pontuação e o outro não.
 */
function buildDigitsSchema({ length }: { readonly length: readonly number[] }) {
  return z
    .string()
    .transform((value) => value.replace(/\D/gu, ''))
    .refine((digits) => digits === '' || length.includes(digits.length), {
      message: `Expected ${length.join(' or ')} digits.`,
    })
}

const TAX_ID_LENGTHS = [11] as const
/** Fixo com DDD tem 10, celular tem 11 — os dois são contato válido de uma pessoa. */
const PHONE_LENGTHS = [10, 11] as const

const optionalEmailSchema = z.union([z.literal(''), z.email()])
const optionalTaxIdSchema = buildDigitsSchema({ length: TAX_ID_LENGTHS })
const optionalPhoneSchema = buildDigitsSchema({ length: PHONE_LENGTHS })

export const inviteCompanyUserSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS),
    contact: z.string().min(1),
    email: optionalEmailSchema.optional(),
    name: z.string().min(1),
    phone: optionalPhoneSchema.optional(),
    roles: buildCompanyRolesSchema(),
    taxId: optionalTaxIdSchema.optional(),
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
    email: optionalEmailSchema.optional(),
    name: z.string().trim().min(1).optional(),
    phone: optionalPhoneSchema.optional(),
    taxId: optionalTaxIdSchema.optional(),
    username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN).optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided.',
  })
export type UpdateCompanyUserProfileBody = z.infer<typeof updateCompanyUserProfileSchema>

export const replaceCompanyUserRolesSchema = z.object({ roles: buildCompanyRolesSchema() }).strict()
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
