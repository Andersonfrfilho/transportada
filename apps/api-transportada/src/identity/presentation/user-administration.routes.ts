/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_USERS_PATH,
  CORRELATION_ID_HEADER,
  CORRELATION_ID_PATTERN,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
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
import type { BackfillIdentityDocumentsUseCase } from '../application/backfill-identity-documents.use-case.js'
import type { ListRolePermissionsUseCase } from '../application/list-role-permissions.use-case.js'
import type { AssignCompanyUserRolesInput } from '../application/assign-company-user-roles.use-case.js'
import type { ReconcileCompanyUsersUseCase } from '../application/reconcile-company-users.use-case.js'
import type { AssignCompanyUserRolesUseCase } from '../application/assign-company-user-roles.use-case.js'
import type { RevealCompanyUsersUseCase } from '../application/reveal-company-users.use-case.js'
import type { FillProfilesFromRealmUseCase } from '../application/fill-profiles-from-realm.use-case.js'
import type { SynchronizeIdentitiesUseCase } from '../application/synchronize-identities.use-case.js'
import type { SetCompanyUserPasswordUseCase } from '../application/set-company-user-password.use-case.js'
import type { CompanyUserView } from '../domain/company-user.policy.js'
import {
  parseChangeCompanyUserStatusRequest,
  parseCompanyUserListQuery,
  parseInviteCompanyUserRequest,
  parseReplaceCompanyUserRolesRequest,
  parseAssignCompanyUserRolesRequest,
  parseRevealCompanyUsersRequest,
  parseSynchronizeIdentitiesRequest,
  parseFillProfilesFromRealmRequest,
  parseSetCompanyUserPasswordRequest,
  parseUpdateCompanyUserProfileRequest,
  parseUuidPathIdentifier,
} from './user-administration.schema.js'

/**
 * Fora da árvore `/:id` de propósito: `reconciliation` não é um usuário, e como caminho literal ele
 * precisa ser declarado antes do parametrizado para não ser lido como identificador.
 */
const RECONCILIATION_PATH = `${API_COMPANY_USERS_PATH}/reconciliation`
const DOCUMENT_BACKFILL_PATH = `${API_COMPANY_USERS_PATH}/document-backfill`
const REVEAL_PATH = `${API_COMPANY_USERS_PATH}/reveal`
const RECONCILIATION_SYNC_PATH = `${API_COMPANY_USERS_PATH}/reconciliation/sync`
/** Irmão do `sync`, e não `/:id/profile`: o alvo é o lote que a tela acabou de mostrar divergente. */
const RECONCILIATION_PROFILES_PATH = `${API_COMPANY_USERS_PATH}/reconciliation/profiles`
const BULK_ROLES_PATH = `${API_COMPANY_USERS_PATH}/roles`
const ROLE_PERMISSIONS_PATH = `${API_COMPANY_USERS_PATH}/role-permissions`
const USER_PATH = `${API_COMPANY_USERS_PATH}/:id`
const USER_INVITATION_PATH = `${USER_PATH}/invitation`
const USER_STATUS_PATH = `${USER_PATH}/status`
const USER_ROLES_PATH = `${USER_PATH}/roles`
/** Recurso próprio, e não campo do `PATCH` do perfil: senha não é dado de ficha, e o corpo do
 * perfil viaja com nome e contato — misturá-los poria a senha no mesmo lugar que se repete ao
 * corrigir um telefone. */
const USER_PASSWORD_PATH = `${USER_PATH}/password`
const USERS_MANAGE_POLICY = { permission: 'users.manage', scope: 'company' } as const
/**
 * Ler contato e documento sem máscara é permissão própria: quem convida, suspende e troca papéis
 * não precisa do CPF de todo mundo para fazer isso, e toda revelação deixa trilha (`security.md` §10).
 */
const USERS_REVEAL_POLICY = { permission: 'users.reveal', scope: 'company' } as const

type Dependencies = {
  readonly changeStatus: ChangeCompanyUserStatusUseCase
  readonly invite: InviteCompanyUserUseCase
  readonly list: ListCompanyUsersUseCase
  readonly backfillDocuments: BackfillIdentityDocumentsUseCase
  readonly reconcile: ReconcileCompanyUsersUseCase
  readonly assignRoles: AssignCompanyUserRolesUseCase
  readonly rolePermissions: ListRolePermissionsUseCase
  readonly reveal: RevealCompanyUsersUseCase
  readonly fillProfiles: FillProfilesFromRealmUseCase
  readonly synchronize: SynchronizeIdentitiesUseCase
  readonly removeMembership: RemoveCompanyUserMembershipUseCase
  readonly replaceRoles: ReplaceCompanyUserRolesUseCase
  readonly resendCode: ResendCompanyUserCodeUseCase
  readonly setPassword: SetCompanyUserPasswordUseCase
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
    defineRoute<{ readonly limit: number }>({
      async handle({ context, input }) {
        const result = await dependencies.reconcile.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => ({ limit: parseReconciliationLimit(new URL(request.url)) }),
      pathname: RECONCILIATION_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    /**
     * Criar quem falta, nos dois sentidos, com alvo explícito. O caminho literal vem antes de
     * `/:id` e é irmão da leitura da reconciliação, de propósito: quem enxerga a divergência é quem
     * a conserta.
     */
    defineRoute<{
      readonly correlationId: string
      readonly subjects: readonly string[]
      readonly userIds: readonly string[]
    }>({
      async handle({ context, input }) {
        const result = await dependencies.synchronize.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseSynchronizeIdentitiesRequest(request)
        return {
          correlationId: readCorrelationId(request) ?? crypto.randomUUID(),
          subjects: body.subjects,
          userIds: body.userIds,
        }
      },
      pathname: RECONCILIATION_SYNC_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    /**
     * O quarto estado: a conta existe dos dois lados e a ficha daqui está vazia. Nome e contato já
     * foram digitados no provedor; copiá-los é mais honesto do que pedir de novo a quem só queria
     * ver a lista.
     */
    defineRoute<{ readonly correlationId: string; readonly userIds: readonly string[] }>({
      async handle({ context, input }) {
        const result = await dependencies.fillProfiles.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseFillProfilesFromRealmRequest(request)
        return {
          correlationId: readCorrelationId(request) ?? crypto.randomUUID(),
          userIds: body.userIds,
        }
      },
      pathname: RECONCILIATION_PROFILES_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    /**
     * O mesmo trabalho da rotina agendada, no recorte da empresa do token e no tempo do operador —
     * a rotina converge sozinha em dias, e quem acabou de cadastrar não quer esperar a janela.
     */
    defineRoute<{ readonly correlationId: string }>({
      async handle({ context, input }) {
        const result = await dependencies.backfillDocuments.execute({
          context: context.scope,
          correlationId: input.correlationId,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      /**
       * O identificador do pedido é o mesmo que atravessa o log; sem cabeçalho, a execução ganha o
       * dela — linha de histórico sem correlação é linha que ninguém liga ao chamado depois.
       */
      parse: ({ request }) => ({
        correlationId: readCorrelationId(request) ?? crypto.randomUUID(),
      }),
      pathname: DOCUMENT_BACKFILL_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    /**
     * `POST` porque a leitura grava auditoria e porque os ids não vão na URL — `security.md` proíbe
     * dado pessoal em query string, e a lista de quem foi revelado é o que a trilha precisa guardar.
     */
    defineRoute<{ readonly correlationId: string; readonly userIds: readonly string[] }>({
      async handle({ context, input }) {
        const users = await dependencies.reveal.execute({
          context: context.scope,
          correlationId: input.correlationId,
          userIds: input.userIds,
        })
        return jsonResponse({ body: { data: users }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseRevealCompanyUsersRequest(request)
        return {
          correlationId: readCorrelationId(request) ?? crypto.randomUUID(),
          userIds: body.userIds,
        }
      },
      pathname: REVEAL_PATH,
      policy: USERS_REVEAL_POLICY,
    }),
    /**
     * `POST` e não `PUT`: aplicar papéis a um lote **acrescenta**, e `PUT` prometeria substituição —
     * que é o que a rota de um usuário só (`/:id/roles`) faz, de propósito. Papel que a pessoa já
     * tem é ignorado pelo banco, então repetir o lote converge.
     */
    defineRoute<Omit<AssignCompanyUserRolesInput, 'context'>>({
      async handle({ context, input }) {
        const result = await dependencies.assignRoles.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseAssignCompanyUserRolesRequest(request)
        return { roles: body.roles, userIds: body.userIds }
      },
      pathname: BULK_ROLES_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    /**
     * A matriz de papel × permissão já existia em código e era invisível: ninguém respondia "o que
     * este papel enxerga?" sem abrir o repositório. Servir da constante, em vez de copiá-la para o
     * frontend, é o que impede as duas de divergirem na primeira permissão nova.
     */
    defineRoute<Record<string, never>>({
      handle: async () =>
        jsonResponse({ body: { data: dependencies.rolePermissions.execute() }, status: 200 }),
      method: 'GET',
      parse: () => ({}),
      pathname: ROLE_PERMISSIONS_PATH,
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
    /**
     * `PUT` porque definir a senha é substituição idempotente: repetir o mesmo corpo converge no
     * mesmo estado, e não existe "senha anterior" para acumular. Responde 204 — devolver qualquer
     * eco do corpo poria a senha numa resposta que atravessa log de proxy.
     */
    defineRoute<{
      readonly correlationId: string
      readonly password: string
      readonly temporary: boolean
      readonly userId: string
    }>({
      async handle({ context, input }) {
        await dependencies.setPassword.execute({ context: context.scope, ...input })
        return new Response(null, { status: 204 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parseSetCompanyUserPasswordRequest(request)
        return {
          correlationId: readCorrelationId(request) ?? crypto.randomUUID(),
          password: body.password,
          temporary: body.temporary,
          userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: USER_PASSWORD_PATH,
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

const RECONCILIATION_DEFAULT_LIMIT = 100
const RECONCILIATION_MAX_LIMIT = 200

/**
 * O recorte é do realm, não da empresa: pedir o realm inteiro numa tacada é o que torna a tela
 * lenta em instalação grande, e um teto sem piso deixaria `limit=0` pedir nada e parecer vazio.
 */
function parseReconciliationLimit(url: URL): number {
  const raw = url.searchParams.get('limit')
  if (raw === null) return RECONCILIATION_DEFAULT_LIMIT
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return RECONCILIATION_DEFAULT_LIMIT
  return Math.min(parsed, RECONCILIATION_MAX_LIMIT)
}

function readCorrelationId(request: Request): string | undefined {
  const value = request.headers.get(CORRELATION_ID_HEADER)
  return value !== null && CORRELATION_ID_PATTERN.test(value) ? value : undefined
}
