/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SERVICE_COMPANY_ROLES } from '../../database/identity.schema.js'
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import { buildWhatsAppPhoneCandidates } from '../domain/whatsapp-phone-candidates.policy.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS } from '../domain/whatsapp-phone-verification.constant.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import type {
  CompanyContextForUserPort,
  MembershipStandingPort,
  WhatsAppActorPhonePort,
} from './whatsapp-actor.port.js'
import type { VerifiedWhatsAppPhone } from './whatsapp-phone.port.js'

const VALIDITY_MS = WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS

/** Para log e métrica, nunca para o número: todas as recusas recebem a mesma resposta (D1). */
export type WhatsAppActorDenialReason =
  | 'unknown_phone'
  | 'unverified_or_expired'
  | 'no_membership'
  | 'service_account'
  | 'suspended'

export type ResolveWhatsAppActorParams = {
  readonly companyId: string
  readonly fromPhone: string
  readonly now: Date
}

export type ResolveWhatsAppActorResult =
  | { readonly status: 'authorized'; readonly context: AuthenticatedContext<CompanyContext> }
  | { readonly status: 'denied'; readonly reason: WhatsAppActorDenialReason }

type ResolveWhatsAppActorDependencies = {
  readonly memberships: MembershipStandingPort
  readonly phones: WhatsAppActorPhonePort
  readonly tenantContext: CompanyContextForUserPort
}

export function createResolveWhatsAppActorUseCase({
  memberships,
  phones,
  tenantContext,
}: ResolveWhatsAppActorDependencies): (
  params: ResolveWhatsAppActorParams,
) => Promise<ResolveWhatsAppActorResult> {
  return async function resolveWhatsAppActor({
    companyId,
    fromPhone,
    now,
  }: ResolveWhatsAppActorParams): Promise<ResolveWhatsAppActorResult> {
    const phone = toWhatsAppPhone(fromPhone)
    if (phone === undefined) return deny('unknown_phone')

    const candidates = buildWhatsAppPhoneCandidates(phone)
    const verified = await findFirstVerified({ candidates, phones })
    if (verified === undefined) {
      const declared = await Promise.all(
        candidates.map((candidate) => phones.hasUnverifiedBindingByPhone({ phone: candidate })),
      )
      return deny(declared.includes(true) ? 'unverified_or_expired' : 'unknown_phone')
    }
    if (now.getTime() - verified.verifiedAt.getTime() > VALIDITY_MS) {
      return deny('unverified_or_expired')
    }

    const lookup = { companyId, userId: verified.userId }
    const context = await tenantContext.resolveCompanyForUser({ ...lookup, channel: 'whatsapp' })
    if (context !== null) {
      /** T005b A1: o vínculo pode ter nascido antes da trava; o papel de serviço é a marca (ADR-0047). */
      if (context.scope.roles.some((role) => SERVICE_COMPANY_ROLES.includes(role))) {
        return deny('service_account')
      }
      return { context, status: 'authorized' }
    }

    const standing = await memberships.findStanding(lookup)
    return deny(standing === 'suspended' ? 'suspended' : 'no_membership')
  }
}

function deny(reason: WhatsAppActorDenialReason): ResolveWhatsAppActorResult {
  return { reason, status: 'denied' }
}

async function findFirstVerified(input: {
  readonly candidates: readonly string[]
  readonly phones: WhatsAppActorPhonePort
}): Promise<VerifiedWhatsAppPhone | undefined> {
  const found = await Promise.all(
    input.candidates.map((phone) => input.phones.findVerifiedByPhone({ phone })),
  )
  return found.find((verified) => verified !== undefined)
}
