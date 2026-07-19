/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import type { AuthenticatedIdentity } from '../domain/authenticated-identity'
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

  public async resolveCompany(
    identity: AuthenticatedIdentity,
  ): Promise<AuthenticatedContext<CompanyContext>> {
    const membership = await this.repository.findActiveByUserAndCompany({
      companyId: identity.companyIdClaim,
      userId: identity.userId,
    })
    if (membership === null) {
      throw forbidden()
    }

    const scope = Object.freeze({
      companyId: identity.companyIdClaim,
      kind: 'company' as const,
      membershipId: membership.membershipId,
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
