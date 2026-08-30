/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_USERS_PATH,
  CORRELATION_ID_HEADER,
  CORRELATION_ID_PATTERN,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { ManageCompanyGroupsUseCase } from '../application/manage-company-groups.use-case.js'
import type { ManageDirectPermissionsUseCase } from '../application/manage-direct-permissions.use-case.js'
import {
  parseAssignCompanyGroupsRequest,
  parseGrantDirectPermissionsRequest,
  parseSaveCompanyGroupRequest,
} from './user-administration.schema.js'
import { parseUuidPathIdentifier } from './user-administration.schema.js'

const GROUPS_PATH = '/company-groups'
const GROUP_PATH = `${GROUPS_PATH}/:id`
const GROUP_ASSIGNMENTS_PATH = `${GROUPS_PATH}/assignments`
const GROUP_MEMBERS_PATH = `${GROUP_PATH}/members`
const USER_PERMISSIONS_PATH = `${API_COMPANY_USERS_PATH}/:id/permissions`

/**
 * Grupo é permissão que a empresa desenha, e por isso tem guarda própria: `users.manage` administra
 * pessoas, `groups.manage` redesenha o que elas alcançam. Quem tem esta última **pode se
 * auto-promover** — decisão registrada —, e toda escrita aqui grava trilha com autor e alvo.
 */
const GROUPS_MANAGE_POLICY = { permission: 'groups.manage', scope: 'company' } as const

type Dependencies = {
  readonly groups: ManageCompanyGroupsUseCase
  readonly permissions: ManageDirectPermissionsUseCase
}

export function createCompanyGroupRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }) {
        const groups = await dependencies.groups.list({ context: context.scope })
        return jsonResponse({ body: { data: groups }, status: 200 })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: GROUPS_PATH,
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<SaveGroupBody>({
      async handle({ context, input }) {
        const group = await dependencies.groups.save({ context: context.scope, ...input })
        return jsonResponse({ body: { data: group }, status: 201 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseSaveCompanyGroupRequest(request)
        return { ...body, correlationId: readCorrelationId(request) }
      },
      pathname: GROUPS_PATH,
      policy: GROUPS_MANAGE_POLICY,
    }),
    /**
     * `PUT` porque o conteúdo do grupo é **substituído**: a tela mostra a lista inteira, e somar
     * papéis aqui tornaria impossível tirar um do grupo pela interface.
     */
    defineRoute<SaveGroupBody & { readonly groupId: string }>({
      async handle({ context, input }) {
        const group = await dependencies.groups.save({ context: context.scope, ...input })
        return jsonResponse({ body: { data: group }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parseSaveCompanyGroupRequest(request)
        return {
          ...body,
          correlationId: readCorrelationId(request),
          groupId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: GROUP_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly groupId: string }>({
      async handle({ context, input }) {
        await dependencies.groups.remove({ context: context.scope, ...input })
        return new Response(null, { status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters, request }) => ({
        correlationId: readCorrelationId(request),
        groupId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: GROUP_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
    /** Caminho literal antes do parametrizado: `assignments` não é um identificador de grupo. */
    defineRoute<{
      readonly correlationId: string
      readonly groupIds: readonly string[]
      readonly userIds: readonly string[]
    }>({
      async handle({ context, input }) {
        const result = await dependencies.groups.assign({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseAssignCompanyGroupsRequest(request)
        return { ...body, correlationId: readCorrelationId(request) }
      },
      pathname: GROUP_ASSIGNMENTS_PATH,
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly groupId: string
      readonly userIds: readonly string[]
    }>({
      async handle({ context, input }) {
        const result = await dependencies.groups.unassign({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'DELETE',
      async parse({ pathParameters, request }) {
        const body = await parseAssignCompanyGroupsRequest(request)
        return {
          correlationId: readCorrelationId(request),
          groupId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          userIds: body.userIds,
        }
      },
      pathname: GROUP_MEMBERS_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly userId: string }>({
      async handle({ context, input }) {
        const permissions = await dependencies.permissions.list({
          context: context.scope,
          userId: input.userId,
        })
        return jsonResponse({ body: { data: { permissions } }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: USER_PERMISSIONS_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly permissions: readonly string[]
      readonly userId: string
    }>({
      async handle({ context, input }) {
        await dependencies.permissions.grant({ context: context.scope, ...input })
        return new Response(null, { status: 204 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseGrantDirectPermissionsRequest(request)
        return {
          correlationId: readCorrelationId(request),
          permissions: body.permissions,
          userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: USER_PERMISSIONS_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly permissions: readonly string[]
      readonly userId: string
    }>({
      async handle({ context, input }) {
        await dependencies.permissions.revoke({ context: context.scope, ...input })
        return new Response(null, { status: 204 })
      },
      method: 'DELETE',
      async parse({ pathParameters, request }) {
        const body = await parseGrantDirectPermissionsRequest(request)
        return {
          correlationId: readCorrelationId(request),
          permissions: body.permissions,
          userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: USER_PERMISSIONS_PATH,
      pathParameterFormat: 'raw',
      policy: GROUPS_MANAGE_POLICY,
    }),
  ]
}

type SaveGroupBody = {
  readonly correlationId: string
  readonly description: string
  readonly name: string
  readonly permissions: readonly string[]
  readonly roles: readonly CompanyRole[]
}

function jsonResponse(input: { readonly body: unknown; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

/** O identificador do pedido é o mesmo que atravessa o log; sem cabeçalho, a linha ganha o dela. */
function readCorrelationId(request: Request): string {
  const value = request.headers.get(CORRELATION_ID_HEADER)
  return value !== null && CORRELATION_ID_PATTERN.test(value) ? value : crypto.randomUUID()
}
