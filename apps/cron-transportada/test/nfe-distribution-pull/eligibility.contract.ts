/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DistributionCandidate,
  DistributionCandidateCertificate,
  DistributionCandidateSourcePort,
} from '../../src/nfe-distribution-pull/application/select-eligible-companies.port.js'
import { createSelectEligibleCompaniesUseCase } from '../../src/nfe-distribution-pull/application/select-eligible-companies.use-case.js'

const NOW = new Date('2026-07-26T12:00:00.000Z')
const COMPANY_A = '00000000-0000-4000-8000-0000000000a1'
const COMPANY_B = '00000000-0000-4000-8000-0000000000a2'

function activeCertificate(): DistributionCandidateCertificate {
  return {
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function eligibleCandidate(companyId: string): DistributionCandidate {
  return {
    certificate: activeCertificate(),
    companyId,
    companyStatus: 'active',
    hasSyntheticMembership: true,
    nextAllowedAt: undefined,
    scheduledDistributionEnabled: true,
  }
}

function createSource(
  candidates: readonly DistributionCandidate[],
): DistributionCandidateSourcePort {
  return {
    listCandidates: () => Promise.resolve(candidates),
  }
}

async function selectEligibleIds(
  candidates: readonly DistributionCandidate[],
): Promise<readonly string[]> {
  const useCase = createSelectEligibleCompaniesUseCase({ source: createSource(candidates) })
  const eligible = await useCase.execute({ environment: 'homologation', now: NOW })
  return eligible.map((company) => company.companyId)
}

describe('scheduled distribution eligibility', () => {
  test('includes a company with flag on, valid certificate, membership and no cooldown', async () => {
    expect(await selectEligibleIds([eligibleCandidate(COMPANY_A)])).toEqual([COMPANY_A])
  })

  test('carries the requested environment on every eligible company', async () => {
    const useCase = createSelectEligibleCompaniesUseCase({
      source: createSource([eligibleCandidate(COMPANY_A)]),
    })
    expect(await useCase.execute({ environment: 'production', now: NOW })).toEqual([
      { companyId: COMPANY_A, environment: 'production' },
    ])
  })

  test('skips a company still inside the anti-656 cooldown window', async () => {
    const inCooldown: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      nextAllowedAt: new Date(NOW.getTime() + 60_000),
    }
    expect(await selectEligibleIds([inCooldown])).toEqual([])
  })

  test('includes a company whose cooldown window has already elapsed', async () => {
    const cooldownElapsed: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      nextAllowedAt: new Date(NOW.getTime() - 1),
    }
    expect(await selectEligibleIds([cooldownElapsed])).toEqual([COMPANY_A])
  })

  test('skips a company with scheduled distribution disabled', async () => {
    const disabled: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      scheduledDistributionEnabled: false,
    }
    expect(await selectEligibleIds([disabled])).toEqual([])
  })

  test('skips a company without an active certificate', async () => {
    const retired: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      certificate: { ...activeCertificate(), status: 'retired' },
    }
    const missing: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_B),
      certificate: undefined,
    }
    expect(await selectEligibleIds([retired, missing])).toEqual([])
  })

  test('skips a company whose certificate is expired or not yet valid at the cycle instant', async () => {
    const expired: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      certificate: { ...activeCertificate(), expiresAt: new Date(NOW.getTime() - 1) },
    }
    const notYetValid: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_B),
      certificate: { ...activeCertificate(), validFrom: new Date(NOW.getTime() + 1) },
    }
    expect(await selectEligibleIds([expired, notYetValid])).toEqual([])
  })

  test('skips a company without the synthetic distribution membership', async () => {
    const withoutMembership: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      hasSyntheticMembership: false,
    }
    expect(await selectEligibleIds([withoutMembership])).toEqual([])
  })

  test('skips a disabled company even when everything else is present', async () => {
    const disabledCompany: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_A),
      companyStatus: 'disabled',
    }
    expect(await selectEligibleIds([disabledCompany])).toEqual([])
  })

  test('includes only the eligible companies from a mixed set', async () => {
    const eligible = eligibleCandidate(COMPANY_A)
    const blocked: DistributionCandidate = {
      ...eligibleCandidate(COMPANY_B),
      scheduledDistributionEnabled: false,
    }
    expect(await selectEligibleIds([eligible, blocked])).toEqual([COMPANY_A])
  })
})
