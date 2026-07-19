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

    const companyIdResult = companyIdClaimSchema.safeParse(verifiedToken.claims.company_id)
    if (!companyIdResult.success) {
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
      companyIdClaim: companyIdResult.data,
      externalIdentityId: externalIdentity.externalIdentityId,
      issuer: verifiedToken.issuer,
      subject: verifiedToken.subject,
      userId: externalIdentity.userId,
    })
  }
}

function unauthenticated(): ApiError {
  return new ApiError(HTTP_ERROR.unauthenticated)
}
