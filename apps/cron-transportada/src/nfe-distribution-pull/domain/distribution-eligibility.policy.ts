/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Pure eligibility rules for the scheduled NF-e distribution pull. A company is
 * only pulled when its operator opted in, holds an active in-window certificate,
 * has the synthetic distribution membership provisioned and is outside the
 * anti-656 cooldown window.
 *
 * Devolve a razão do descarte, não só um booleano: é ela que o ciclo loga e que
 * a API repete na tela. O mesmo vocabulário vive em
 * `apps/api-transportada/src/companies/domain/distribution-eligibility.policy.ts`
 * — as duas apps não compartilham código-fonte, e cada lado tem contract test
 * sobre esta tabela. A primeira razão encontrada é a reportada.
 */
import type { DistributionCandidate } from '../application/select-eligible-companies.port.js'

export const DISTRIBUTION_INELIGIBILITY_REASONS = [
  'company_disabled',
  'not_opted_in',
  'missing_synthetic_membership',
  'certificate_missing',
  'certificate_not_yet_valid',
  'certificate_expired',
  'cooldown_active',
] as const

export type DistributionIneligibilityReason = (typeof DISTRIBUTION_INELIGIBILITY_REASONS)[number]

export type DistributionEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: DistributionIneligibilityReason }

type EvaluateDistributionEligibilityParams = {
  readonly candidate: DistributionCandidate
  readonly now: Date
}

const ELIGIBLE: DistributionEligibility = { eligible: true }

export function evaluateDistributionEligibility({
  candidate,
  now,
}: EvaluateDistributionEligibilityParams): DistributionEligibility {
  const reason = findBlockingReason(candidate, now)
  return reason === undefined ? ELIGIBLE : { eligible: false, reason }
}

function findBlockingReason(
  candidate: DistributionCandidate,
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (candidate.companyStatus !== 'active') return 'company_disabled'
  if (!candidate.scheduledDistributionEnabled) return 'not_opted_in'
  if (!candidate.hasSyntheticMembership) return 'missing_synthetic_membership'

  const certificateReason = findCertificateReason(candidate.certificate, now)
  if (certificateReason !== undefined) return certificateReason

  const nextAllowedAt = candidate.nextAllowedAt
  if (nextAllowedAt !== undefined && nextAllowedAt.getTime() > now.getTime()) {
    return 'cooldown_active'
  }
  return undefined
}

function findCertificateReason(
  certificate: DistributionCandidate['certificate'],
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (certificate === undefined || certificate.status !== 'active') return 'certificate_missing'
  if (certificate.validFrom.getTime() > now.getTime()) return 'certificate_not_yet_valid'
  if (certificate.expiresAt.getTime() <= now.getTime()) return 'certificate_expired'
  return undefined
}
