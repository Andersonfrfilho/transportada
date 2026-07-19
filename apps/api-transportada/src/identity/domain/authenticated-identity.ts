/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type AuthenticatedIdentity = {
  /**
   * A verified token selection only. It is not a tenant context until T011
   * confirms the active company membership in PostgreSQL.
   */
  readonly companyIdClaim: string
  readonly externalIdentityId: string
  readonly issuer: string
  readonly subject: string
  readonly userId: string
}
