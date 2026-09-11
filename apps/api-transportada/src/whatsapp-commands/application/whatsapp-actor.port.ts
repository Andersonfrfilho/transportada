/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  MembershipLookup,
  MembershipStanding,
} from '../../identity/application/tenant-context.port.js'
import type { ResolveCompanyForUserParams } from '../../identity/application/tenant-context.service.js'
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import type { WhatsAppPhoneRepositoryPort } from './whatsapp-phone.port.js'

export type { MembershipStanding }

export type MembershipStandingPort = {
  readonly findStanding: (input: MembershipLookup) => Promise<MembershipStanding>
}

export type CompanyContextForUserPort = {
  readonly resolveCompanyForUser: (
    input: ResolveCompanyForUserParams,
  ) => Promise<AuthenticatedContext<CompanyContext> | null>
}

export type WhatsAppActorPhonePort = Pick<
  WhatsAppPhoneRepositoryPort,
  'findVerifiedByPhone' | 'hasUnverifiedBindingByPhone'
>
