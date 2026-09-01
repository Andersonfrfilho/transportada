/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import {
  freezeTripFinancialResult,
  TripFinancialRecalculationReasonRequiredError,
} from '../../src/trips/application/freeze-trip-financial-result.use-case.js'
import type {
  TripFinancialResult,
  TripFinancialResultPort,
} from '../../src/trips/application/trip-financial-result.port.js'
import type { TripValuation } from '../../src/trips/domain/trip-valuation.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000003'

function valuation(overrides: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [
      { amount: '812.4500', gap: null, kind: 'driver', source: 'measured' },
      { amount: '480.0000', gap: null, kind: 'fuel', source: 'estimated' },
      { amount: '0.0000', gap: null, kind: 'icms', source: 'measured' },
      { amount: '73.0000', gap: null, kind: 'pis_cofins', source: 'measured' },
    ],
    hasGaps: false,
    marginPercentage: '32.100000',
    revenueLines: [
      {
        amount: '2000.0000',
        gap: null,
        nfeDocumentId: null,
        source: 'measured',
        tripDocumentId: 'a',
      },
    ],
    revenueSource: 'measured',
    totalCost: '1365.4500',
    totalMargin: '634.5500',
    totalRevenue: '2000.0000',
    ...overrides,
  }
}

function buildRepository(current: TripFinancialResult | null = null) {
  const written: unknown[] = []

  const repository: TripFinancialResultPort = {
    async findCurrent() {
      return current
    },
    async insertVersion(input) {
      written.push(structuredClone(input.result))
      return { ...input.result, frozenAt: '2026-09-01T12:00:00.000Z', version: 1 }
    },
  }

  return { repository, written }
}

describe('o congelamento do resultado (spec 061 T005)', () => {
  /** Imposto desce da receita; custo sai do bolso. A separação é o que a tela mostra. */
  test('separa imposto de custo, e o líquido é receita menos os dois', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: { fuelPricePerLiter: '6.0000' },
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation(),
    })

    expect(written[0]).toMatchObject({
      costTotal: '1292.4500',
      netAmount: '634.5500',
      revenueAmount: '2000.0000',
      taxTotal: '73.0000',
    })
  })

  /** ADR-0049 §2: parcela desconhecida é zero **com nome** — o banco recusaria valor ali. */
  test('parcela ausente e de período entram zeradas, com a origem preservada', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        costParcels: [
          { amount: '0.0000', gap: null, kind: 'driver', source: 'period' },
          { amount: '0.0000', gap: 'NO_FUEL_BASELINE', kind: 'fuel', source: 'missing' },
        ],
        hasGaps: true,
      }),
    })

    const parcels = (
      written[0] as {
        parcels: readonly {
          amount: string
          kind: string
          nature: string
          note: string
          source: string
        }[]
      }
    ).parcels
    expect(parcels).toContainEqual({
      amount: '0.0000',
      kind: 'driver',
      nature: 'cost',
      note: '',
      source: 'period',
    })
    expect(parcels).toContainEqual({
      amount: '0.0000',
      kind: 'fuel',
      nature: 'cost',
      note: 'NO_FUEL_BASELINE',
      source: 'missing',
    })
  })

  /** O número existe e é mostrado; o que não pode é ele parecer final. */
  test('marca incompleto quando falta CT-e ou quando alguma parcela é desconhecida', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        revenueLines: [
          {
            amount: '2000.0000',
            gap: null,
            nfeDocumentId: null,
            source: 'measured',
            tripDocumentId: 'a',
          },
          {
            amount: '0.0000',
            gap: 'NO_FREIGHT_RULE',
            nfeDocumentId: null,
            source: 'missing',
            tripDocumentId: 'b',
          },
        ],
      }),
    })

    expect(written[0]).toMatchObject({
      isComplete: false,
      revenueDocumentCount: 1,
      revenueExpectedCount: 2,
    })
  })

  /** A versão 2 sem explicação é a pergunta "por que esse número mudou?" sem resposta. */
  test('recalcular um congelado exige motivo', async () => {
    const frozen: TripFinancialResult = {
      assumptions: {},
      costTotal: '0.0000',
      frozenAt: '2026-09-01T12:00:00.000Z',
      isComplete: true,
      marginRate: null,
      netAmount: '0.0000',
      parcels: [],
      recalculationReason: '',
      revenueAmount: '0.0000',
      revenueDocumentCount: 0,
      revenueExpectedCount: 0,
      taxTotal: '0.0000',
      tripId: TRIP_ID,
      version: 1,
    }
    const { repository, written } = buildRepository(frozen)

    await expect(
      freezeTripFinancialResult({
        actorUserId: USER_ID,
        assumptions: {},
        companyId: COMPANY_ID,
        repository,
        tripId: TRIP_ID,
        valuation: valuation(),
      }),
    ).rejects.toBeInstanceOf(TripFinancialRecalculationReasonRequiredError)
    expect(written).toEqual([])

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      reason: 'CT-e cancelado depois do fechamento',
      repository,
      tripId: TRIP_ID,
      valuation: valuation(),
    })
    expect(written).toHaveLength(1)
  })
})

describe('quem enxerga a margem (ADR-0049 §6)', () => {
  const service = new AuthorizationService()
  const POLICY = { permission: 'trip.financials', scope: 'company' } as const

  function contextFor(
    role: keyof typeof COMPANY_ROLE_PERMISSIONS,
  ): AuthenticatedContext<CompanyContext> {
    return {
      identity: {} as never,
      scope: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: 'membership',
        permissions: new Set(COMPANY_ROLE_PERMISSIONS[role]),
        roles: [role],
        userId: USER_ID,
      } as unknown as CompanyContext,
    }
  }

  /**
   * O valor pago ao motorista é dado sensível **para o próprio motorista**, que tem `trip.read`. E
   * quem separa carga não precisa saber a margem — a lista abaixo é nominal de propósito.
   */
  test('só o dono do ambiente e o financeiro alcançam o resultado', () => {
    for (const role of ['company-admin', 'finance'] as const) {
      expect(() => service.authorize(contextFor(role), POLICY)).not.toThrow()
    }

    for (const role of ['driver', 'aggregate', 'separator', 'operator', 'fiscal'] as const) {
      expect(() => service.authorize(contextFor(role), POLICY)).toThrow()
    }
  })
})
