/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_USERS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ChangeCompanyUserStatusInput,
  ChangeCompanyUserStatusUseCase,
} from '../application/change-company-user-status.use-case.js'
import type {
  InviteCompanyUserInput,
  InviteCompanyUserUseCase,
} from '../application/invite-company-user.use-case.js'
import type {
  ListCompanyUsersInput,
  ListCompanyUsersUseCase,
} from '../application/list-company-users.use-case.js'
import type {
  RemoveCompanyUserMembershipInput,
  RemoveCompanyUserMembershipUseCase,
} from '../application/remove-company-user-membership.use-case.js'
import type {
  ReplaceCompanyUserRolesInput,
  ReplaceCompanyUserRolesUseCase,
} from '../application/replace-company-user-roles.use-case.js'
import type {
  ResendCompanyUserCodeInput,
  ResendCompanyUserCodeUseCase,
} from '../application/resend-company-user-code.use-case.js'
import type {
  UpdateCompanyUserProfileInput,
  UpdateCompanyUserProfileUseCase,
} from '../application/update-company-user-profile.use-case.js'
import type { CompanyUserView } from '../domain/company-user.policy.js'
import {
  parseChangeCompanyUserStatusRequest,
  parseCompanyUserListQuery,
  parseInviteCompanyUserRequest,
  parseReplaceCompanyUserRolesRequest,
  parseUpdateCompanyUserProfileRequest,
  parseUuidPathIdentifier,
} from './user-administration.schema.js'

const USER_PATH = `${API_COMPANY_USERS_PATH}/:id`
const USER_INVITATION_PATH = `${USER_PATH}/invitation`
const USER_STATUS_PATH = `${USER_PATH}/status`
const USER_ROLES_PATH = `${USER_PATH}/roles`
const USERS_MANAGE_POLICY = { permission: 'users.manage', scope: 'company' } as const

type Dependencies = {
  readonly changeStatus: ChangeCompanyUserStatusUseCase
  readonly invite: InviteCompanyUserUseCase
  readonly list: ListCompanyUsersUseCase
  readonly removeMembership: RemoveCompanyUserMembershipUseCase
  readonly replaceRoles: ReplaceCompanyUserRolesUseCase
  readonly resendCode: ResendCompanyUserCodeUseCase
  readonly updateProfile: UpdateCompanyUserProfileUseCase
}

export function createUserAdministrationRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListCompanyUsersInput, 'context'>>({
      async handle({ context, input }) {
        const page = await dependencies.list.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: page.items.map(serializeCompanyUser),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseCompanyUserListQuery(new URL(request.url)),
      pathname: API_COMPANY_USERS_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<InviteCompanyUserInput, 'context'>>({
      async handle({ context, input }) {
        const companyUser = await dependencies.invite.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeCompanyUser(companyUser) }, status: 201 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseInviteCompanyUserRequest(request)
        return {
          channel: body.channel,
          contact: body.contact,
          name: body.name,
          roles: body.roles,
          ...(body.email === undefined ? {} : { email: body.email }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
          ...(body.taxId === undefined ? {} : { taxId: body.taxId }),
        }
      },
      pathname: API_COMPANY_USERS_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<ResendCompanyUserCodeInput, 'context'>>({
      async handle({ context, input }) {
        const delivery = await dependencies.resendCode.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: delivery }, status: 202 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: USER_INVITATION_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<ChangeCompanyUserStatusInput, 'context'>>({
      async handle({ context, input }) {
        const companyUser = await dependencies.changeStatus.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeCompanyUser(companyUser) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const body = await parseChangeCompanyUserStatusRequest(request)
        return { status: body.status, userId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: USER_STATUS_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<ReplaceCompanyUserRolesInput, 'context'>>({
      async handle({ context, input }) {
        const companyUser = await dependencies.replaceRoles.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeCompanyUser(companyUser) }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parseReplaceCompanyUserRolesRequest(request)
        return { roles: body.roles, userId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: USER_ROLES_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<UpdateCompanyUserProfileInput, 'context'>>({
      async handle({ context, input }) {
        const companyUser = await dependencies.updateProfile.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeCompanyUser(companyUser) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const body = await parseUpdateCompanyUserProfileRequest(request)
        return {
          userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(body.channel === undefined ? {} : { channel: body.channel }),
          ...(body.contact === undefined ? {} : { contact: body.contact }),
          ...(body.email === undefined ? {} : { email: body.email }),
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
          ...(body.taxId === undefined ? {} : { taxId: body.taxId }),
          ...(body.username === undefined ? {} : { username: body.username }),
        }
      },
      pathname: USER_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<Omit<RemoveCompanyUserMembershipInput, 'context'>>({
      async handle({ context, input }) {
        await dependencies.removeMembership.execute({ context: context.scope, ...input })
        return new Response(null, { status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: USER_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeCompanyUser(companyUser: CompanyUserView): object {
  return { ...companyUser }
}
