/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type VerifiedIdentityToken = {
  readonly audience: string | readonly string[]
  readonly claims: Readonly<Record<string, unknown>>
  readonly expiresAt: number
  readonly issuer: string
  readonly subject: string
}

export type AccessTokenVerifierPort = {
  verify(token: string): Promise<VerifiedIdentityToken>
}

export type IdentityReadinessPort = {
  checkReadiness(): Promise<boolean>
}

export class AccessTokenRejectedError extends Error {
  public constructor() {
    super('Access token rejected')
    this.name = 'AccessTokenRejectedError'
  }
}

export type ActiveExternalIdentity = {
  readonly externalIdentityId: string
  readonly userId: string
}

export type ExternalIdentityLookup = {
  readonly issuer: string
  readonly subject: string
}

export type ExternalIdentityRepositoryPort = {
  findActiveByIssuerAndSubject(
    input: ExternalIdentityLookup,
  ): Promise<ActiveExternalIdentity | null>
}

export type AuthenticationPort = {
  authenticate(
    authorizationHeader: string | null,
  ): Promise<import('../domain/authenticated-identity').AuthenticatedIdentity>
}
