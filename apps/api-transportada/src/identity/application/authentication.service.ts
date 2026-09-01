/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import type { AuthenticatedIdentity } from '../domain/authenticated-identity'
import type {
  AccessTokenVerifierPort,
  AuthenticationPort,
  ExternalIdentityRepositoryPort,
} from './identity.port'
import { AccessTokenRejectedError } from './identity.port'

const bearerAuthorizationSchema = z
  .string()
  .regex(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)
  .transform((value) => value.slice(value.indexOf(' ') + 1))
const companyIdClaimSchema = z.string().uuid()

type AuthenticationServiceParams = {
  readonly repository: ExternalIdentityRepositoryPort
  readonly verifier: AccessTokenVerifierPort
}

export class AuthenticationService implements AuthenticationPort {
  private readonly repository: ExternalIdentityRepositoryPort
  private readonly verifier: AccessTokenVerifierPort

  public constructor({ repository, verifier }: AuthenticationServiceParams) {
    this.repository = repository
    this.verifier = verifier
  }

  public async authenticate(authorizationHeader: string | null): Promise<AuthenticatedIdentity> {
    const tokenResult = bearerAuthorizationSchema.safeParse(authorizationHeader)
    if (!tokenResult.success) {
      throw unauthenticated()
    }

    let verifiedToken: Awaited<ReturnType<AccessTokenVerifierPort['verify']>>
    try {
      verifiedToken = await this.verifier.verify(tokenResult.data)
    } catch (error: unknown) {
      if (error instanceof AccessTokenRejectedError) {
        throw unauthenticated()
      }
      throw error
    }

    const serviceAccount = hasRealmRole(verifiedToken.claims, SERVICE_ACCOUNT_REALM_ROLE)
    const companyIdResult = companyIdClaimSchema.safeParse(verifiedToken.claims.company_id)
    /**
     * ADR-0047 §3: o token do serviço **não** carrega empresa, e exigir a claim dele o deixaria de
     * fora. Para todo o resto ela continua obrigatória — é ela que prende a pessoa a um tenant.
     */
    if (!companyIdResult.success && !serviceAccount) {
      throw unauthenticated()
    }

    const externalIdentity = await this.repository.findActiveByIssuerAndSubject({
      issuer: verifiedToken.issuer,
      subject: verifiedToken.subject,
    })
    if (externalIdentity === null) {
      throw unauthenticated()
    }

    return Object.freeze({
      companyIdClaim: companyIdResult.success ? companyIdResult.data : null,
      externalIdentityId: externalIdentity.externalIdentityId,
      issuer: verifiedToken.issuer,
      platformAdmin: hasRealmRole(verifiedToken.claims, PLATFORM_ADMIN_REALM_ROLE),
      serviceAccount,
      subject: verifiedToken.subject,
      userId: externalIdentity.userId,
    })
  }
}

const PLATFORM_ADMIN_REALM_ROLE = 'platform-admin'
/** ADR-0047 §2: o serviço entra pela mesma porta do `platform-admin`, com papel próprio. */
const SERVICE_ACCOUNT_REALM_ROLE = 'transportada-service'

function hasRealmRole(claims: Readonly<Record<string, unknown>>, wanted: string): boolean {
  const realmAccess = claims.realm_access
  if (typeof realmAccess !== 'object' || realmAccess === null || Array.isArray(realmAccess)) {
    return false
  }

  const roles = (realmAccess as Readonly<Record<string, unknown>>).roles
  return Array.isArray(roles) && roles.some((role) => role === wanted)
}

function unauthenticated(): ApiError {
  return new ApiError(HTTP_ERROR.unauthenticated)
}
