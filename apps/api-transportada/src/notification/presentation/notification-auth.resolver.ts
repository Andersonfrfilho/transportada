/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AuthContextResolverPort } from '@adatechnology/module-http'

import type { AuthenticationPort } from '../../identity/application/identity.port.js'
import type { TenantContextService } from '../../identity/application/tenant-context.service.js'
import { ApiError } from '../../shared/api.error.js'

type CreateNotificationAuthResolverParams = {
  readonly authentication: AuthenticationPort
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

/**
 * O módulo não conhece Keycloak nem membership: recebe a identidade **já validada** e aplica
 * autorização por objeto. Quem valida continua sendo a aplicação, com o mesmo caminho das demais
 * rotas — token pelo `authentication`, empresa pelo `tenantContext`.
 */
export function createNotificationAuthResolver({
  authentication,
  tenantContext,
}: CreateNotificationAuthResolverParams): AuthContextResolverPort {
  return Object.freeze({
    async resolve({ headers }: { readonly headers: Readonly<Record<string, string>> }) {
      const identity = await authenticateIdentity({ authentication, headers })
      if (identity === undefined) return undefined
      const context = await resolveCompanyContext({ identity, tenantContext })
      return {
        companyId: context.scope.companyId,
        scopes: [...context.scope.permissions],
        userId: context.scope.userId,
      }
    },
  })
}

type AuthenticateIdentityParams = {
  readonly authentication: AuthenticationPort
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Token ausente, expirado ou recusado é a mesma resposta: identidade não resolvida. O módulo
 * traduz isso em 401 — nada aqui distingue os casos, porque distinguir informaria o atacante.
 */
async function authenticateIdentity({ authentication, headers }: AuthenticateIdentityParams) {
  try {
    return await authentication.authenticate(headers.authorization ?? null)
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) return undefined
    throw error
  }
}

type ResolveCompanyContextParams = {
  readonly identity: Awaited<ReturnType<AuthenticationPort['authenticate']>>
  readonly tenantContext: Pick<TenantContextService, 'resolveCompany'>
}

/**
 * Devolver `undefined` aqui viraria 401 no módulo, e "não tem vínculo com esta empresa" não é
 * "não se identificou". O filtro do `module-http` reconhece erro de domínio pela forma
 * (`statusCode`/`code`/`message`), e é essa forma que a tradução preserva.
 */
async function resolveCompanyContext({ identity, tenantContext }: ResolveCompanyContextParams) {
  try {
    return await tenantContext.resolveCompany(identity)
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status !== 401) {
      throw new NotificationAuthorizationError(error)
    }
    throw error
  }
}

class NotificationAuthorizationError extends Error {
  public readonly code: string
  public readonly statusCode: number

  public constructor(error: ApiError) {
    super(error.message)
    this.name = 'NotificationAuthorizationError'
    this.code = error.code
    this.statusCode = error.status
  }
}
