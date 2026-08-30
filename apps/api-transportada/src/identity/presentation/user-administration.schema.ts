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
import { isCompanyPermission } from '../domain/authorization.policy.js'

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

/**
 * O teto existe para o "revelar todos" não virar exportação da base inteira num clique: a tela
 * revela a página que está na frente do operador, e cada revelação grava trilha de auditoria.
 */
const REVEAL_BATCH_LIMIT = 100

/** O mesmo teto do revelar: lote é a página na frente do operador, não a base inteira. */
export const assignCompanyUserRolesSchema = z
  .object({
    roles: buildCompanyRolesSchema(),
    userIds: z.array(z.uuid()).min(1).max(REVEAL_BATCH_LIMIT),
  })
  .strict()
export type AssignCompanyUserRolesBody = z.infer<typeof assignCompanyUserRolesSchema>

export const revealCompanyUsersSchema = z
  .object({ userIds: z.array(z.uuid()).min(1).max(REVEAL_BATCH_LIMIT) })
  .strict()
export type RevealCompanyUsersBody = z.infer<typeof revealCompanyUsersSchema>

/**
 * O nome da permissão é validado contra o catálogo — a coluna não tem CHECK, e é aqui que o nome
 * inventado para. Papel continua no `enum` do catálogo fechado.
 */
const companyPermissionSchema = z.string().refine(isCompanyPermission, {
  message: 'Unknown permission.',
})

export const saveCompanyGroupSchema = z
  .object({
    description: z.string().trim().max(240).default(''),
    name: z.string().trim().min(1).max(80),
    permissions: z.array(companyPermissionSchema).max(120),
    /** Grupo sem papel é legítimo: ele pode conceder só permissões avulsas. */
    roles: z.array(z.enum(COMPANY_ROLES)).max(COMPANY_ROLES.length),
  })
  .strict()
export type SaveCompanyGroupBody = z.infer<typeof saveCompanyGroupSchema>

export const assignCompanyGroupsSchema = z
  .object({
    groupIds: z.array(z.uuid()).min(1).max(REVEAL_BATCH_LIMIT),
    userIds: z.array(z.uuid()).min(1).max(REVEAL_BATCH_LIMIT),
  })
  .strict()
export type AssignCompanyGroupsBody = z.infer<typeof assignCompanyGroupsSchema>

/** Alvo explícito nas duas direções: varredura cega importaria o realm inteiro para dentro da empresa. */
export const synchronizeIdentitiesSchema = z
  .object({
    subjects: z.array(z.string().trim().min(1)).max(REVEAL_BATCH_LIMIT).default([]),
    userIds: z.array(z.uuid()).max(REVEAL_BATCH_LIMIT).default([]),
  })
  .strict()
  .refine((body) => body.subjects.length + body.userIds.length > 0, {
    message: 'Nothing to synchronize.',
  })
export type SynchronizeIdentitiesBody = z.infer<typeof synchronizeIdentitiesSchema>

export const grantDirectPermissionsSchema = z
  .object({ permissions: z.array(companyPermissionSchema).min(1).max(120) })
  .strict()
export type GrantDirectPermissionsBody = z.infer<typeof grantDirectPermissionsSchema>

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

export async function parseAssignCompanyUserRolesRequest(
  request: Request,
): Promise<AssignCompanyUserRolesBody> {
  return parseBody(assignCompanyUserRolesSchema, request)
}

export async function parseSaveCompanyGroupRequest(
  request: Request,
): Promise<SaveCompanyGroupBody> {
  return parseBody(saveCompanyGroupSchema, request)
}

export async function parseAssignCompanyGroupsRequest(
  request: Request,
): Promise<AssignCompanyGroupsBody> {
  return parseBody(assignCompanyGroupsSchema, request)
}

export async function parseGrantDirectPermissionsRequest(
  request: Request,
): Promise<GrantDirectPermissionsBody> {
  return parseBody(grantDirectPermissionsSchema, request)
}

export async function parseSynchronizeIdentitiesRequest(
  request: Request,
): Promise<SynchronizeIdentitiesBody> {
  return parseBody(synchronizeIdentitiesSchema, request)
}

export async function parseRevealCompanyUsersRequest(
  request: Request,
): Promise<RevealCompanyUsersBody> {
  return parseBody(revealCompanyUsersSchema, request)
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
