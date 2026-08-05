/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  evaluateDistributionEligibility,
  type DistributionEligibilityFacts,
} from '../../src/companies/domain/distribution-eligibility.policy.js'

const NOW = new Date('2026-08-05T21:00:00.000Z')

function facts(
  overrides: Partial<DistributionEligibilityFacts> = {},
): DistributionEligibilityFacts {
  return {
    certificate: {
      expiresAt: new Date('2026-11-05T16:34:24.000Z'),
      status: 'active',
      validFrom: new Date('2025-11-05T16:34:24.000Z'),
    },
    companyStatus: 'active',
    hasSyntheticMembership: true,
    nextAllowedAt: undefined,
    scheduledDistributionEnabled: true,
    ...overrides,
  }
}

describe('distribution eligibility policy contract', () => {
  test('accepts a company that satisfies every condition', () => {
    expect(evaluateDistributionEligibility({ facts: facts(), now: NOW })).toEqual({
      eligible: true,
    })
  })

  test.each([
    ['company_disabled', { companyStatus: 'disabled' }],
    ['not_opted_in', { scheduledDistributionEnabled: false }],
    ['missing_synthetic_membership', { hasSyntheticMembership: false }],
    ['certificate_missing', { certificate: undefined }],
    [
      'certificate_missing',
      {
        certificate: {
          expiresAt: new Date('2026-11-05T16:34:24.000Z'),
          status: 'retired' as const,
          validFrom: new Date('2025-11-05T16:34:24.000Z'),
        },
      },
    ],
    [
      'certificate_not_yet_valid',
      {
        certificate: {
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          status: 'active' as const,
          validFrom: new Date('2026-08-06T00:00:00.000Z'),
        },
      },
    ],
    [
      'certificate_expired',
      {
        certificate: {
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
          status: 'active' as const,
          validFrom: new Date('2025-01-01T00:00:00.000Z'),
        },
      },
    ],
    ['cooldown_active', { nextAllowedAt: new Date('2026-08-05T22:00:00.000Z') }],
  ] as const)('reports %s', (reason, overrides) => {
    expect(evaluateDistributionEligibility({ facts: facts(overrides), now: NOW })).toEqual({
      eligible: false,
      reason,
    })
  })

  test.each([
    [
      'company status outranks every other pending condition',
      { certificate: undefined, companyStatus: 'disabled' as const, hasSyntheticMembership: false },
      'company_disabled',
    ],
    [
      'opt-in outranks the synthetic membership and the certificate',
      {
        certificate: undefined,
        hasSyntheticMembership: false,
        scheduledDistributionEnabled: false,
      },
      'not_opted_in',
    ],
    [
      'synthetic membership outranks the certificate',
      { certificate: undefined, hasSyntheticMembership: false },
      'missing_synthetic_membership',
    ],
    [
      'cooldown is reported last, only when nothing else is pending',
      {
        hasSyntheticMembership: false,
        nextAllowedAt: new Date('2026-08-05T22:00:00.000Z'),
      },
      'missing_synthetic_membership',
    ],
  ] as const)('%s', (_title, overrides, reason) => {
    expect(evaluateDistributionEligibility({ facts: facts(overrides), now: NOW })).toEqual({
      eligible: false,
      reason,
    })
  })

  test('treats a cooldown boundary that already elapsed as eligible', () => {
    const candidate = facts({ nextAllowedAt: NOW })

    expect(evaluateDistributionEligibility({ facts: candidate, now: NOW })).toEqual({
      eligible: true,
    })
  })

  test('treats a certificate expiring exactly now as expired', () => {
    const candidate = facts({
      certificate: { expiresAt: NOW, status: 'active', validFrom: new Date('2025-01-01') },
    })

    expect(evaluateDistributionEligibility({ facts: candidate, now: NOW })).toEqual({
      eligible: false,
      reason: 'certificate_expired',
    })
  })
})
