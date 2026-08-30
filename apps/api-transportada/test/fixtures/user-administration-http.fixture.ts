/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import { LastCompanyAdminError } from '../../src/identity/domain/invitation.error'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

/** Recusas de domínio que a rota precisa devolver com código estável e sem contar o motivo real. */
export type RefusalKind = 'cross-tenant' | 'duplicate-username' | 'last-admin' | 'self-removal'

type RouteDependencies = {
  readonly changeStatus: { execute(input: ExecuteCall): Promise<typeof COMPANY_USER> }
  readonly invite: { execute(input: ExecuteCall): Promise<typeof INVITED_COMPANY_USER> }
  readonly list: { execute(input: ExecuteCall): Promise<typeof COMPANY_USER_PAGE> }
  readonly backfillDocuments: { execute(input: ExecuteCall): Promise<typeof BACKFILL_RESULT> }
  readonly reconcile: { execute(input: ExecuteCall): Promise<typeof RECONCILIATION_RESULT> }
  readonly removeMembership: { execute(input: ExecuteCall): Promise<void> }
  readonly replaceRoles: { execute(input: ExecuteCall): Promise<typeof COMPANY_USER> }
  readonly resendCode: { execute(input: ExecuteCall): Promise<typeof INVITATION_DELIVERY> }
  readonly updateProfile: { execute(input: ExecuteCall): Promise<typeof COMPANY_USER> }
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly refusal?: RefusalKind
}

export const COMPANY_USERS_PATH = '/company-users'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const CORRELATION_ID = 'user-administration-http-correlation'
export const TARGET_USER_ID = '00000000-0000-4000-8000-000000000921'
export const OTHER_COMPANY_USER_ID = '00000000-0000-4000-8000-000000000922'

/** Contato sintético: nenhum endereço real entra em fixture, log ou evidência. */
export const INVITE_CONTACT = 'convidado@example.test'

export const INVITE_BODY = {
  channel: 'email',
  contact: INVITE_CONTACT,
  name: 'Pessoa Convidada',
  roles: ['fiscal'],
} as const

export const REPLACE_ROLES_BODY = { roles: ['fiscal', 'company-admin'] } as const

/** Contato e login sintéticos: nenhum dado de pessoa real entra em fixture, log ou evidência. */
export const UPDATED_CONTACT = '+550000000000'

export const UPDATE_PROFILE_BODY = {
  channel: 'whatsapp',
  contact: UPDATED_CONTACT,
  email: 'pessoa.editada@example.test',
  name: 'Pessoa Editada',
  username: 'pessoa.editada',
} as const

export const CHANGE_STATUS_BODY = { status: 'suspended' } as const

export const TARGET_MEMBERSHIP_ID = '5b1a4a1e-1a0c-4f4a-9d1a-2f0c7d3b5e11'

export const COMPANY_USER = {
  contact: { channel: 'email', masked: 'c***@e***.test' },
  email: 'c***@e***.test',
  id: TARGET_USER_ID,
  invitation: { expiresAt: '2026-08-06T12:00:00.000Z', status: 'pending' },
  membershipId: TARGET_MEMBERSHIP_ID,
  name: 'Pessoa Convidada',
  phone: '',
  roles: ['fiscal'],
  status: 'invited',
  taxId: '***09',
  username: TARGET_USER_ID,
}

export const COMPANY_USER_PAGE = { items: [COMPANY_USER], nextCursor: null }

/** A reconciliação responde os dois lados; o que a rota precisa provar é o recorte e a permissão. */
export const BACKFILL_RESULT = { skipped: 1, written: 2 }

export const RECONCILIATION_RESULT = {
  hasMoreRealmUsers: false,
  items: [
    {
      local: {
        contact: 't***@e***.com.br',
        email: 't***@e***.com.br',
        membershipId: COMPANY_USER.membershipId,
        name: COMPANY_USER.name,
        taxId: '***09',
        userId: COMPANY_USER.id,
      },
      matchedBy: 'subject',
      status: 'linked',
    },
  ],
}

/** O convite responde o que a listagem responde, mais o resultado do vínculo com a frota. */
export const INVITED_COMPANY_USER = {
  ...COMPANY_USER,
  fleetLink: 'not-applicable' as 'linked' | 'no-driver-record' | 'not-applicable',
}

export const UPDATED_COMPANY_USER = {
  ...COMPANY_USER,
  contact: { channel: 'whatsapp', masked: '+55*******00' },
  name: UPDATE_PROFILE_BODY.name,
  username: UPDATE_PROFILE_BODY.username,
}

export const INVITATION_DELIVERY = {
  expiresAt: '2026-08-06T12:00:00.000Z',
  userId: TARGET_USER_ID,
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['users.manage']),
}

/** Perfil que administra a empresa em tudo, menos usuários — a fronteira que o contrato cobra. */
export const WITHOUT_USERS_MANAGE_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'settings.manage',
])

export async function createUserAdministrationHttpFixture(
  params: CreateFixtureParams = {},
): Promise<{
  readonly changeStatusCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly inviteCalls: ExecuteCall[]
  readonly listCalls: ExecuteCall[]
  readonly backfillCalls: ExecuteCall[]
  readonly reconcileCalls: ExecuteCall[]
  readonly removeMembershipCalls: ExecuteCall[]
  readonly replaceRolesCalls: ExecuteCall[]
  readonly resendCodeCalls: ExecuteCall[]
  readonly updateProfileCalls: ExecuteCall[]
}> {
  const changeStatusCalls: ExecuteCall[] = []
  const inviteCalls: ExecuteCall[] = []
  const listCalls: ExecuteCall[] = []
  const backfillCalls: ExecuteCall[] = []
  const reconcileCalls: ExecuteCall[] = []
  const removeMembershipCalls: ExecuteCall[] = []
  const replaceRolesCalls: ExecuteCall[] = []
  const resendCodeCalls: ExecuteCall[] = []
  const updateProfileCalls: ExecuteCall[] = []

  const refuse = async (): Promise<never> => {
    throw await refusalError(params.refusal ?? 'cross-tenant')
  }

  const routes = await loadRoutes({
    changeStatus: {
      async execute(input) {
        changeStatusCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
        return { ...COMPANY_USER, status: 'suspended' }
      },
    },
    invite: {
      async execute(input) {
        inviteCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
        return INVITED_COMPANY_USER
      },
    },
    backfillDocuments: {
      async execute(input) {
        backfillCalls.push(structuredClone(input))
        return BACKFILL_RESULT
      },
    },
    reconcile: {
      async execute(input) {
        reconcileCalls.push(structuredClone(input))
        return RECONCILIATION_RESULT
      },
    },
    list: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        return COMPANY_USER_PAGE
      },
    },
    removeMembership: {
      async execute(input) {
        removeMembershipCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
      },
    },
    replaceRoles: {
      async execute(input) {
        replaceRolesCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
        return { ...COMPANY_USER, roles: [...REPLACE_ROLES_BODY.roles] }
      },
    },
    resendCode: {
      async execute(input) {
        resendCodeCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
        return INVITATION_DELIVERY
      },
    },
    updateProfile: {
      async execute(input) {
        updateProfileCalls.push(structuredClone(input))
        if (params.refusal) return refuse()
        return UPDATED_COMPANY_USER
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    changeStatusCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    inviteCalls,
    listCalls,
    backfillCalls,
    reconcileCalls,
    removeMembershipCalls,
    replaceRolesCalls,
    resendCodeCalls,
    updateProfileCalls,
  }
}

export function jsonRequest(input: {
  readonly body?: unknown
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
}

export async function responseApiError(response: Response): Promise<{
  readonly code: string
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
  return payload.error
}

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}

async function refusalError(kind: RefusalKind): Promise<Error> {
  if (kind === 'last-admin') return new LastCompanyAdminError()

  const module = (await import('../../src/identity/domain/company-user.error.js')) as {
    CompanyUserNotFoundError: new () => Error
    DuplicateUsernameError: new () => Error
    SelfMembershipRemovalError: new () => Error
  }
  if (kind === 'duplicate-username') return new module.DuplicateUsernameError()
  return kind === 'cross-tenant'
    ? new module.CompanyUserNotFoundError()
    : new module.SelfMembershipRemovalError()
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/identity/presentation/user-administration.routes.js'
  )) as {
    createUserAdministrationRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createUserAdministrationRoutes(input)
}

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        authorization.authorize(value, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        return input.context
      },
    },
  })
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'user-administration-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
