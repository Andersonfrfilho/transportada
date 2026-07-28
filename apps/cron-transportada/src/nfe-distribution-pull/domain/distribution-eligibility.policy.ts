/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Pure eligibility rules for the scheduled NF-e distribution pull. A company is
 * only pulled when its operator opted in, holds an active in-window certificate,
 * has the synthetic distribution membership provisioned and is outside the
 * anti-656 cooldown window.
 */
import type { DistributionCandidate } from '../application/select-eligible-companies.port.js'

function hasActiveCertificate(candidate: DistributionCandidate, now: Date): boolean {
  const certificate = candidate.certificate
  if (certificate === undefined) return false
  if (certificate.status !== 'active') return false
  if (certificate.validFrom.getTime() > now.getTime()) return false
  return certificate.expiresAt.getTime() > now.getTime()
}

function isOutsideCooldown(candidate: DistributionCandidate, now: Date): boolean {
  const nextAllowedAt = candidate.nextAllowedAt
  if (nextAllowedAt === undefined) return true
  return nextAllowedAt.getTime() <= now.getTime()
}

export function isCompanyEligibleForDistribution(input: {
  readonly candidate: DistributionCandidate
  readonly now: Date
}): boolean {
  const { candidate, now } = input
  if (candidate.companyStatus !== 'active') return false
  if (!candidate.scheduledDistributionEnabled) return false
  if (!candidate.hasSyntheticMembership) return false
  if (!hasActiveCertificate(candidate, now)) return false
  return isOutsideCooldown(candidate, now)
}
