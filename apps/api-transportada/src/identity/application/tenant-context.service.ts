/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import type { AuthenticatedIdentity } from '../domain/authenticated-identity'
import { resolveCompanyPermissions } from '../domain/authorization.policy'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../domain/tenant-context'
import type { MembershipRepositoryPort } from './tenant-context.port'

type TenantContextServiceParams = {
  readonly repository: MembershipRepositoryPort
}

export class TenantContextService {
  private readonly repository: MembershipRepositoryPort

  public constructor({ repository }: TenantContextServiceParams) {
    this.repository = repository
  }

  /**
   * ADR-0047 §3: para **service account** a empresa chega no pedido, porque o token dele é
   * cross-tenant por natureza — o worker processa CT-e de todas as empresas, e um cliente do
   * Keycloak por tenant exigiria provisionamento por empresa.
   *
   * Isso dobra o `security.md` §2, que manda nunca derivar tenant de campo do cliente — e a guarda
   * que sustenta a dobra é esta função não mudar em nada o resto: **a empresa pedida é validada
   * contra a membership real do serviço**, exatamente como a claim de gente é. Sem membership, 403.
   * Um token de serviço vazado alcança as empresas onde a membership sintética existe, e nenhuma
   * além.
   *
   * Para todo token de gente, `requestedCompanyId` é **ignorado**: quem manda é a claim.
   */
  public async resolveCompany(
    identity: AuthenticatedIdentity,
    requestedCompanyId?: string | null,
  ): Promise<AuthenticatedContext<CompanyContext>> {
    const companyId = identity.serviceAccount
      ? normalizeRequestedCompanyId(requestedCompanyId)
      : identity.companyIdClaim
    if (companyId === null) {
      throw forbidden()
    }

    const membership = await this.repository.findActiveByUserAndCompany({
      companyId,
      userId: identity.userId,
    })
    if (membership === null) {
      throw forbidden()
    }

    const scope = Object.freeze({
      companyId,
      kind: 'company' as const,
      membershipId: membership.membershipId,
      permissions: resolveCompanyPermissions({
        granted: membership.grantedPermissions,
        roles: membership.roles,
      }),
      roles: Object.freeze([...membership.roles]),
      userId: identity.userId,
    })

    return Object.freeze({ identity: snapshotIdentity(identity), scope })
  }

  public resolvePlatform(identity: AuthenticatedIdentity): AuthenticatedContext<PlatformContext> {
    if (!identity.platformAdmin) {
      throw forbidden()
    }

    const scope = Object.freeze({
      kind: 'platform' as const,
      userId: identity.userId,
    })
    return Object.freeze({ identity: snapshotIdentity(identity), scope })
  }
}

function snapshotIdentity(identity: AuthenticatedIdentity): AuthenticatedIdentity {
  return Object.freeze({ ...identity })
}

function forbidden(): ApiError {
  return new ApiError(HTTP_ERROR.forbidden)
}

const requestedCompanyIdSchema = z.string().uuid()

/** Empresa fora de forma é 403, não 500: o `eq` com texto que não é UUID estoura no Postgres. */
function normalizeRequestedCompanyId(requested: string | null | undefined): string | null {
  if (requested === undefined || requested === null) return null
  return requestedCompanyIdSchema.safeParse(requested).success ? requested : null
}
