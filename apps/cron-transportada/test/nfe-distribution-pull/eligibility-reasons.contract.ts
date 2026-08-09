/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CronLogger } from '../../src/config/cron.types.js'
import type {
  DistributionCandidate,
  DistributionCandidateCertificate,
  DistributionCandidateSourcePort,
} from '../../src/nfe-distribution-pull/application/select-eligible-companies.port.js'
import { createSelectEligibleCompaniesUseCase } from '../../src/nfe-distribution-pull/application/select-eligible-companies.use-case.js'
import { evaluateDistributionEligibility } from '../../src/nfe-distribution-pull/domain/distribution-eligibility.policy.js'

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

function candidate(overrides: Partial<DistributionCandidate> = {}): DistributionCandidate {
  return {
    certificate: activeCertificate(),
    companyId: COMPANY_A,
    companyStatus: 'active',
    hasSyntheticMembership: true,
    nextAllowedAt: undefined,
    scheduledDistributionEnabled: true,
    ...overrides,
  }
}

type LoggedCall = { readonly message: string; readonly metadata: Record<string, unknown> }

function createRecordingLogger(): { readonly calls: LoggedCall[]; readonly logger: CronLogger } {
  const calls: LoggedCall[] = []
  const record = (message: string, metadata?: Record<string, unknown>) => {
    calls.push({ message, metadata: metadata ?? {} })
  }
  return { calls, logger: { error: record, info: record, warn: record } }
}

function createSource(
  candidates: readonly DistributionCandidate[],
): DistributionCandidateSourcePort {
  return { listCandidates: () => Promise.resolve(candidates) }
}

describe('cron distribution eligibility reasons', () => {
  test.each([
    ['company_disabled', { companyStatus: 'disabled' as const }],
    ['not_opted_in', { scheduledDistributionEnabled: false }],
    ['missing_synthetic_membership', { hasSyntheticMembership: false }],
    ['certificate_missing', { certificate: undefined }],
    [
      'certificate_missing',
      { certificate: { ...activeCertificate(), status: 'retired' as const } },
    ],
    [
      'certificate_not_yet_valid',
      { certificate: { ...activeCertificate(), validFrom: new Date(NOW.getTime() + 1) } },
    ],
    [
      'certificate_expired',
      { certificate: { ...activeCertificate(), expiresAt: new Date(NOW.getTime() - 1) } },
    ],
    ['cooldown_active', { nextAllowedAt: new Date(NOW.getTime() + 60_000) }],
  ] as const)('reports %s, matching the API policy table', (reason, overrides) => {
    expect(evaluateDistributionEligibility({ candidate: candidate(overrides), now: NOW })).toEqual({
      eligible: false,
      reason,
    })
  })

  test('accepts a candidate that satisfies every condition', () => {
    expect(evaluateDistributionEligibility({ candidate: candidate(), now: NOW })).toEqual({
      eligible: true,
    })
  })

  test.each([
    [
      { certificate: undefined, companyStatus: 'disabled' as const, hasSyntheticMembership: false },
      'company_disabled',
    ],
    [
      {
        certificate: undefined,
        hasSyntheticMembership: false,
        scheduledDistributionEnabled: false,
      },
      'not_opted_in',
    ],
    [{ certificate: undefined, hasSyntheticMembership: false }, 'missing_synthetic_membership'],
  ] as const)('keeps the first blocking reason as the reported one', (overrides, reason) => {
    expect(evaluateDistributionEligibility({ candidate: candidate(overrides), now: NOW })).toEqual({
      eligible: false,
      reason,
    })
  })
})

describe('cron logs why a company was discarded', () => {
  test('emits one cron_company_not_eligible per discarded company', async () => {
    const { calls, logger } = createRecordingLogger()
    const useCase = createSelectEligibleCompaniesUseCase({
      logger,
      source: createSource([
        candidate({ scheduledDistributionEnabled: false }),
        candidate({ certificate: undefined, companyId: COMPANY_B }),
      ]),
    })

    const result = await useCase.execute({ environment: 'homologation', now: NOW })

    expect(result.eligible).toEqual([])
    expect(calls.filter((call) => call.message === 'cron_company_not_eligible')).toEqual([
      {
        message: 'cron_company_not_eligible',
        metadata: { companyId: COMPANY_A, reason: 'not_opted_in' },
      },
      {
        message: 'cron_company_not_eligible',
        metadata: { companyId: COMPANY_B, reason: 'certificate_missing' },
      },
    ])
  })

  test('stays silent for an eligible company and returns it', async () => {
    const { calls, logger } = createRecordingLogger()
    const useCase = createSelectEligibleCompaniesUseCase({
      logger,
      source: createSource([candidate()]),
    })

    const result = await useCase.execute({ environment: 'production', now: NOW })

    expect(result.eligible).toEqual([{ companyId: COMPANY_A, environment: 'production' }])
    expect(calls.filter((call) => call.message === 'cron_company_not_eligible')).toEqual([])
  })

  test('tallies every reason so the cycle log can carry the breakdown', async () => {
    const { logger } = createRecordingLogger()
    const useCase = createSelectEligibleCompaniesUseCase({
      logger,
      source: createSource([
        candidate({ scheduledDistributionEnabled: false }),
        candidate({ companyId: COMPANY_B, scheduledDistributionEnabled: false }),
        candidate({ certificate: undefined, companyId: '00000000-0000-4000-8000-0000000000a3' }),
        candidate({ companyId: '00000000-0000-4000-8000-0000000000a4' }),
      ]),
    })

    const result = await useCase.execute({ environment: 'homologation', now: NOW })

    expect(result.ineligibleCounts).toEqual({
      certificate_expired: 0,
      certificate_missing: 1,
      certificate_not_yet_valid: 0,
      company_disabled: 0,
      cooldown_active: 0,
      missing_synthetic_membership: 0,
      not_opted_in: 2,
    })
    expect(result.eligible).toHaveLength(1)
  })

  test('never puts company identifying data beyond the opaque id in a log', async () => {
    const { calls, logger } = createRecordingLogger()
    const useCase = createSelectEligibleCompaniesUseCase({
      logger,
      source: createSource([candidate({ scheduledDistributionEnabled: false })]),
    })

    await useCase.execute({ environment: 'homologation', now: NOW })

    for (const call of calls) {
      expect(Object.keys(call.metadata).sort()).toEqual(['companyId', 'reason'])
    }
  })
})
