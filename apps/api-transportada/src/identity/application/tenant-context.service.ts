/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import type { AuthenticatedIdentity, AuthenticationChannel } from '../domain/authenticated-identity'
import { resolveCompanyPermissions } from '../domain/authorization.policy'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../domain/tenant-context'
import type { MembershipLookup, MembershipRepositoryPort } from './tenant-context.port'

type TenantContextServiceParams = {
  readonly repository: MembershipRepositoryPort
}

export type ResolveCompanyForUserParams = {
  readonly channel: AuthenticationChannel
  readonly companyId: string
  readonly userId: string
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

    const scope = await this.resolveCompanyScope({ companyId, userId: identity.userId })
    if (scope === null) {
      throw forbidden()
    }

    return Object.freeze({ identity: snapshotIdentity(identity), scope })
  }

  /**
   * Spec 144 T005: a mesma membership ativa + empresa ativa + permissões do caminho HTTP, para uma
   * identidade que chegou por canal. Recusa é `null`, não 403: no canal ela é fluxo esperado, e quem
   * decide a resposta é o chamador.
   */
  public async resolveCompanyForUser({
    channel,
    companyId,
    userId,
  }: ResolveCompanyForUserParams): Promise<AuthenticatedContext<CompanyContext> | null> {
    const scope = await this.resolveCompanyScope({ companyId, userId })
    if (scope === null) return null

    const identity = Object.freeze({
      channel,
      companyIdClaim: companyId,
      externalIdentityId: '',
      issuer: channel,
      platformAdmin: false,
      serviceAccount: false,
      subject: '',
      userId,
    })
    return Object.freeze({ identity, scope })
  }

  private async resolveCompanyScope(lookup: MembershipLookup): Promise<CompanyContext | null> {
    const membership = await this.repository.findActiveByUserAndCompany(lookup)
    if (membership === null) return null

    return Object.freeze({
      companyId: lookup.companyId,
      kind: 'company' as const,
      membershipId: membership.membershipId,
      permissions: resolveCompanyPermissions({
        granted: membership.grantedPermissions,
        roles: membership.roles,
      }),
      roles: Object.freeze([...membership.roles]),
      userId: lookup.userId,
    })
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
