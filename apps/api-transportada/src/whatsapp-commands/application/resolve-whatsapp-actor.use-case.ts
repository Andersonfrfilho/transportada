/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS } from '../domain/whatsapp-phone-verification.constant.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import type {
  CompanyContextForUserPort,
  MembershipStandingPort,
  WhatsAppActorPhonePort,
} from './whatsapp-actor.port.js'
import type { VerifiedWhatsAppPhone } from './whatsapp-phone.port.js'

const DAY_MS = 86_400_000
const VALIDITY_MS = WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS * DAY_MS
const MOBILE_WITH_NINTH_DIGIT_LENGTH = 13
const MOBILE_WITHOUT_NINTH_DIGIT_LENGTH = 12
const NINTH_DIGIT_POSITION = 4
const NINTH_DIGIT = '9'

/** Para log e métrica, nunca para o número: as quatro recusas recebem a mesma resposta (D1). */
export type WhatsAppActorDenialReason =
  | 'unknown_phone'
  | 'unverified_or_expired'
  | 'no_membership'
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

    const candidates = buildPhoneCandidates(phone)
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
    if (context !== null) return { context, status: 'authorized' }

    const standing = await memberships.findStanding(lookup)
    return deny(standing === 'suspended' ? 'suspended' : 'no_membership')
  }
}

function deny(reason: WhatsAppActorDenialReason): ResolveWhatsAppActorResult {
  return { reason, status: 'denied' }
}

/**
 * O repositório casa exato, e a Meta às vezes entrega o celular sem o nono dígito: procura-se pela
 * forma recebida e pela outra, a mesma equivalência de `isSameWhatsAppPhone`. A recebida vem primeiro.
 */
function buildPhoneCandidates(phone: string): readonly string[] {
  if (
    phone.length === MOBILE_WITH_NINTH_DIGIT_LENGTH &&
    phone[NINTH_DIGIT_POSITION] === NINTH_DIGIT
  ) {
    return [phone, phone.slice(0, NINTH_DIGIT_POSITION) + phone.slice(NINTH_DIGIT_POSITION + 1)]
  }
  if (phone.length === MOBILE_WITHOUT_NINTH_DIGIT_LENGTH) {
    return [
      phone,
      phone.slice(0, NINTH_DIGIT_POSITION) + NINTH_DIGIT + phone.slice(NINTH_DIGIT_POSITION),
    ]
  }
  return [phone]
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
