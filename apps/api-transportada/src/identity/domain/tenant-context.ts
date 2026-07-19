/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/database.schema'
import type { AuthenticatedIdentity } from './authenticated-identity'
import type { CompanyPermission } from './authorization.policy'

export type CompanyContext = {
  readonly companyId: string
  readonly kind: 'company'
  readonly membershipId: string
  readonly permissions: ReadonlySet<CompanyPermission>
  readonly roles: readonly CompanyRole[]
  readonly userId: string
}

export type PlatformContext = {
  readonly kind: 'platform'
  readonly userId: string
}

export type AuthenticatedContext<TScope extends CompanyContext | PlatformContext> = {
  readonly identity: AuthenticatedIdentity
  readonly scope: TScope
}
