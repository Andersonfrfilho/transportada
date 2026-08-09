/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A tela lê a elegibilidade partindo de `companies`; o cron precisa partir do
 * mesmo lugar. Enquanto a consulta do cron partia de `company_distribution_settings`
 * — tabela cuja linha só nasce quando alguém mexe no interruptor —, empresa que
 * nunca optou era invisível para o ciclo: `evaluatedCount` saía 0 e
 * `ineligibleCounts.not_opted_in` saía 0, o que se lê como "nada bloqueado".
 */
import { describe, expect, test } from 'bun:test'

import { toDistributionCandidate } from '../../src/nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.js'
import { evaluateDistributionEligibility } from '../../src/nfe-distribution-pull/domain/distribution-eligibility.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-07-26T12:00:00.000Z')

const SOURCE_PATH = new URL(
  '../../src/nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.ts',
  import.meta.url,
).pathname

function row(overrides: Record<string, unknown> = {}) {
  return {
    certificateExpiresAt: null,
    certificateStatus: null,
    certificateValidFrom: null,
    companyId: COMPANY_ID,
    companyStatus: 'active' as const,
    membershipId: null,
    nextAllowedAt: null,
    scheduledDistributionEnabled: null,
    ...overrides,
  }
}

describe('distribution candidate scope contract', () => {
  test('empresa sem linha de configuração conta como não optante, não como ausente', () => {
    const candidate = toDistributionCandidate(row())

    expect(candidate.scheduledDistributionEnabled).toBe(false)
    expect(evaluateDistributionEligibility({ candidate, now: NOW })).toEqual({
      eligible: false,
      reason: 'not_opted_in',
    })
  })

  test('opt-in ligado atravessa o mapeamento sem alteração', () => {
    expect(toDistributionCandidate(row({ scheduledDistributionEnabled: true }))).toMatchObject({
      scheduledDistributionEnabled: true,
    })
  })

  test('a varredura parte de companies, com as configurações em left join', async () => {
    const source = await Bun.file(SOURCE_PATH).text()

    expect(source).toContain('.from(companies)')
    expect(source).not.toContain('.from(companyDistributionSettings)')
    expect(source).toMatch(/leftJoin\(\s*companyDistributionSettings/)
  })
})
