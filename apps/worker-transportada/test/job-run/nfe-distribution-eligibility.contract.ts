/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Guarda deste lado a cópia por valor da elegibilidade de distribuição: o vocabulário, a **ordem** em
 * que ele desempata, a leitura de fatos que o adaptador faz e o balde da chave de idempotência.
 */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_INELIGIBILITY_REASONS,
  evaluateDistributionEligibility,
  type DistributionCandidateCertificate,
  type DistributionEligibilityCandidate,
} from '../../src/nfe-distribution-pull/domain/distribution-eligibility.policy.js'
import {
  DISTRIBUTION_CADENCE_MINUTES,
  deriveDistributionIdempotencyKey,
} from '../../src/nfe-distribution-pull/domain/distribution-idempotency.policy.js'
import { DISTRIBUTION_PULL_JOB } from '../../src/nfe-distribution-pull/domain/distribution-pull.constant.js'
import { toDistributionCandidate } from '../../src/nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.js'
import {
  JOB_FAILURE_OUTCOMES,
  JOB_MINIMUM_INTERVAL_SECONDS,
} from '../../src/shared/job-catalog.constant.js'

const NOW = new Date('2026-08-24T09:00:00.000Z')
const COMPANY_ID = '4c3e6d1a-8b2f-4d5e-9a7c-1b2c3d4e5f60'

const CERTIFICATE: DistributionCandidateCertificate = {
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  status: 'active',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
}

const ELIGIBLE_CANDIDATE: DistributionEligibilityCandidate = {
  certificate: CERTIFICATE,
  companyStatus: 'active',
  hasSyntheticMembership: true,
  nextAllowedAt: undefined,
  scheduledDistributionEnabled: true,
}

function evaluate(overrides: Partial<DistributionEligibilityCandidate>): unknown {
  return evaluateDistributionEligibility({
    candidate: { ...ELIGIBLE_CANDIDATE, ...overrides },
    now: NOW,
  })
}

describe('nfe distribution eligibility', () => {
  test('o vocabulário é o do catálogo, palavra por palavra e na mesma ordem', () => {
    expect([...DISTRIBUTION_INELIGIBILITY_REASONS]).toEqual([
      'company_disabled',
      'not_opted_in',
      'missing_synthetic_membership',
      'certificate_missing',
      'certificate_not_yet_valid',
      'certificate_expired',
      'cooldown_active',
    ])
    expect([...JOB_FAILURE_OUTCOMES[DISTRIBUTION_PULL_JOB]]).toEqual([
      ...DISTRIBUTION_INELIGIBILITY_REASONS,
    ])
  })

  test('empresa de janela aberta é elegível', () => {
    expect(evaluate({})).toEqual({ eligible: true })
  })

  test('cada razão é reportada pelo seu nome', () => {
    expect(evaluate({ companyStatus: 'disabled' })).toEqual({
      eligible: false,
      reason: 'company_disabled',
    })
    expect(evaluate({ scheduledDistributionEnabled: false })).toEqual({
      eligible: false,
      reason: 'not_opted_in',
    })
    expect(evaluate({ hasSyntheticMembership: false })).toEqual({
      eligible: false,
      reason: 'missing_synthetic_membership',
    })
    expect(evaluate({ certificate: undefined })).toEqual({
      eligible: false,
      reason: 'certificate_missing',
    })
    expect(evaluate({ certificate: { ...CERTIFICATE, status: 'retired' } })).toEqual({
      eligible: false,
      reason: 'certificate_missing',
    })
    expect(
      evaluate({
        certificate: {
          ...CERTIFICATE,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
        },
      }),
    ).toEqual({ eligible: false, reason: 'certificate_not_yet_valid' })
    expect(
      evaluate({
        certificate: {
          ...CERTIFICATE,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    ).toEqual({ eligible: false, reason: 'certificate_expired' })
    expect(evaluate({ nextAllowedAt: new Date('2026-08-24T09:30:00.000Z') })).toEqual({
      eligible: false,
      reason: 'cooldown_active',
    })
  })

  test('a espera vencida não bloqueia, e o instante exato já libera', () => {
    expect(evaluate({ nextAllowedAt: new Date('2026-08-24T08:59:59.999Z') })).toEqual({
      eligible: true,
    })
    expect(evaluate({ nextAllowedAt: NOW })).toEqual({ eligible: true })
  })

  test('o certificado vencido vence a espera: é o que o operador tem de resolver', () => {
    expect(
      evaluate({
        certificate: {
          ...CERTIFICATE,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        nextAllowedAt: new Date('2026-08-24T09:30:00.000Z'),
      }),
    ).toEqual({ eligible: false, reason: 'certificate_expired' })
  })
})

describe('nfe distribution candidate mapping', () => {
  const ROW = {
    certificateExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    certificateStatus: 'active',
    certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
    companyId: COMPANY_ID,
    companyStatus: 'active',
    environment: 'production',
    membershipUserId: '00000000-0000-4000-8000-000000000006',
    nextAllowedAt: new Date('2026-08-24T10:00:00.000Z'),
    scheduledDistributionEnabled: true,
  } as const

  test('o ambiente do candidato é o do perfil da empresa, não um global', () => {
    expect(
      toDistributionCandidate({ environment: 'homologation', row: { ...ROW } }).environment,
    ).toBe('homologation')
    expect(
      toDistributionCandidate({ environment: 'production', row: { ...ROW } }).environment,
    ).toBe('production')
  })

  test('ausência no join vira ausência na política, nunca `null`', () => {
    const candidate = toDistributionCandidate({
      environment: 'production',
      row: {
        ...ROW,
        certificateExpiresAt: null,
        certificateStatus: null,
        certificateValidFrom: null,
        membershipUserId: null,
        nextAllowedAt: null,
        scheduledDistributionEnabled: null,
      },
    })

    expect(candidate.certificate).toBeUndefined()
    expect(candidate.hasSyntheticMembership).toBe(false)
    expect(candidate.nextAllowedAt).toBeUndefined()
    // Opt-in ausente é opt-in fechado: a busca automática nunca liga por omissão.
    expect(candidate.scheduledDistributionEnabled).toBe(false)
  })

  test('certificado só existe quando as três colunas vieram', () => {
    expect(
      toDistributionCandidate({
        environment: 'production',
        row: { ...ROW, certificateExpiresAt: null },
      }).certificate,
    ).toBeUndefined()
  })
})

describe('nfe distribution idempotency key', () => {
  test('a cadência sai do catálogo, não de configuração', () => {
    expect(DISTRIBUTION_CADENCE_MINUTES).toBe(
      JOB_MINIMUM_INTERVAL_SECONDS[DISTRIBUTION_PULL_JOB] / 60,
    )
    expect(DISTRIBUTION_CADENCE_MINUTES).toBe(5)
  })

  test('dois instantes do mesmo balde dão a mesma chave', () => {
    const first = deriveDistributionIdempotencyKey({
      cadenceMinutes: DISTRIBUTION_CADENCE_MINUTES,
      companyId: COMPANY_ID,
      cycleInstant: new Date('2026-08-24T09:00:01.000Z'),
      environment: 'production',
    })
    const second = deriveDistributionIdempotencyKey({
      cadenceMinutes: DISTRIBUTION_CADENCE_MINUTES,
      companyId: COMPANY_ID,
      cycleInstant: new Date('2026-08-24T09:04:59.999Z'),
      environment: 'production',
    })

    expect(first).toBe(second)
    expect(first).toBe(
      `${DISTRIBUTION_PULL_JOB}:production:${COMPANY_ID}:${new Date('2026-08-24T09:00:00.000Z').getTime()}`,
    )
  })

  test('balde seguinte, empresa outra e ambiente outro dão chaves diferentes', () => {
    const base = {
      cadenceMinutes: DISTRIBUTION_CADENCE_MINUTES,
      companyId: COMPANY_ID,
      cycleInstant: new Date('2026-08-24T09:00:00.000Z'),
      environment: 'production',
    } as const

    const key = deriveDistributionIdempotencyKey(base)

    expect(
      deriveDistributionIdempotencyKey({
        ...base,
        cycleInstant: new Date('2026-08-24T09:05:00.000Z'),
      }),
    ).not.toBe(key)
    expect(
      deriveDistributionIdempotencyKey({
        ...base,
        companyId: '00000000-0000-4000-8000-0000000000ff',
      }),
    ).not.toBe(key)
    // Homologação e produção têm cursor próprio: uma chave só pularia NSU de um lado.
    expect(deriveDistributionIdempotencyKey({ ...base, environment: 'homologation' })).not.toBe(key)
  })
})
