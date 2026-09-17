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
      { amount: '812.4500', detail: null, gap: null, kind: 'driver', source: 'measured' },
      { amount: '480.0000', detail: null, gap: null, kind: 'fuel', source: 'estimated' },
      { amount: '0.0000', detail: null, gap: null, kind: 'icms', source: 'measured' },
      { amount: '73.0000', detail: null, gap: null, kind: 'pis_cofins', source: 'measured' },
    ],
    hasGaps: false,
    marginPercentage: '32.100000',
    revenueLines: [
      {
        amount: '2000.0000',
        gap: null,
        nfeDocumentId: null,
        freightRuleId: null,
        freightRuleName: null,
        percentage: null,
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

/** A linha como o repositório a recebe — o teste lê `note` e `amount` da mesma parcela. */
type TripFinancialParcelRow = {
  readonly amount: string
  readonly kind: string
  readonly note: string
}

/** O mesmo `\u00A0` que o `Intl` do navegador escreve: o `R$` nunca se separa do número. */
const NON_BREAKING_SPACE = '\u00A0'

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
          { amount: '0.0000', detail: null, gap: null, kind: 'driver', source: 'period' },
          {
            amount: '0.0000',
            detail: null,
            gap: 'NO_FUEL_BASELINE',
            kind: 'fuel',
            source: 'missing',
          },
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

  /**
   * Spec 143 D5/T6: sem lacuna, `note` grava a frase de origem — a mesma que o painel aberto
   * compõe a partir do `basis` cru (T11) — para a viagem fechada continuar legível sem o cadastro.
   */
  test('parcela do motorista sem lacuna grava a frase de origem, não o código', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        costParcels: [
          {
            amount: '600.0000',
            basis: {
              crew: [
                {
                  dailyAmount: '200.0000',
                  driverId: '00000000-0000-4000-8000-000000000010',
                  driverName: 'Motorista Um',
                  paymentModel: 'route_table',
                  rateOrigin: 'company',
                  subtotal: '600.0000',
                },
              ],
              days: 3,
              daysOrigin: 'estimated',
              of: 'driver',
            },
            detail: null,
            gap: null,
            kind: 'driver',
            source: 'estimated',
          },
        ],
      }),
    })

    const parcels = (written[0] as { parcels: readonly TripFinancialParcelRow[] }).parcels
    expect(parcels).toContainEqual(
      expect.objectContaining({
        kind: 'driver',
        note: `R$${NON_BREAKING_SPACE}200,00 × 3 dias · valor geral`,
      }),
    )
  })

  /**
   * ⚠️ O fator não arredonda. Cortar a diária de `numeric(19,4)` para as duas casas da exibição
   * **antes** da multiplicação faz a frase desmentir o próprio total: "R$ 200,34 × 3 dias" para uma
   * parcela de R$ 601,0050. Quem confere a margem multiplica o que lê — 200,335 × 3 = 601,005.
   */
  test('a diária de quatro casas é escrita inteira, e os fatores da frase fecham o total', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        costParcels: [
          {
            amount: '601.0050',
            basis: {
              crew: [
                {
                  dailyAmount: '200.3350',
                  driverId: '00000000-0000-4000-8000-000000000010',
                  driverName: 'Motorista Um',
                  paymentModel: 'route_table',
                  rateOrigin: 'company',
                  subtotal: '601.0050',
                },
              ],
              days: 3,
              daysOrigin: 'informed',
              of: 'driver',
            },
            detail: null,
            gap: null,
            kind: 'driver',
            source: 'measured',
          },
        ],
      }),
    })

    const parcels = (written[0] as { parcels: readonly TripFinancialParcelRow[] }).parcels
    const driver = parcels.find((parcel) => parcel.kind === 'driver')

    expect(driver?.note).toBe(`R$${NON_BREAKING_SPACE}200,335 × 3 dias · valor geral`)
    expect(driver?.amount).toBe('601.0050')
  })

  /**
   * A lacuna vence sempre: sem `basis` (viagem sem condutor), `note` não pode inventar frase —
   * o código é o único texto que sobra sem cadastro nenhum para descrever.
   */
  test('parcela do motorista com lacuna mantém o código, nunca a frase', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        costParcels: [
          {
            amount: '0.0000',
            basis: null,
            detail: null,
            gap: 'NO_TRIP_DRIVER',
            kind: 'driver',
            source: 'missing',
          },
        ],
        hasGaps: true,
      }),
    })

    const parcels = (written[0] as { parcels: readonly TripFinancialParcelRow[] }).parcels
    expect(parcels).toContainEqual(
      expect.objectContaining({ kind: 'driver', note: 'NO_TRIP_DRIVER' }),
    )
  })

  /** D2: mais de um condutor soma a viagem — a frase soma junto, uma linha por condutor. */
  test('mais de um condutor: a frase soma uma linha por condutor', async () => {
    const { repository, written } = buildRepository()

    await freezeTripFinancialResult({
      actorUserId: USER_ID,
      assumptions: {},
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
      valuation: valuation({
        costParcels: [
          {
            amount: '900.0000',
            basis: {
              crew: [
                {
                  dailyAmount: '250.0000',
                  driverId: '00000000-0000-4000-8000-000000000011',
                  driverName: 'Agregado',
                  paymentModel: 'route_table',
                  rateOrigin: 'driver',
                  subtotal: '500.0000',
                },
                {
                  dailyAmount: '200.0000',
                  driverId: '00000000-0000-4000-8000-000000000012',
                  driverName: 'Da casa',
                  paymentModel: 'fixed',
                  rateOrigin: 'default',
                  subtotal: '400.0000',
                },
              ],
              days: 2,
              daysOrigin: 'informed',
              of: 'driver',
            },
            detail: null,
            gap: null,
            kind: 'driver',
            source: 'measured',
          },
        ],
      }),
    })

    const parcels = (written[0] as { parcels: readonly TripFinancialParcelRow[] }).parcels
    expect(parcels).toContainEqual(
      expect.objectContaining({
        kind: 'driver',
        note: `R$${NON_BREAKING_SPACE}250,00 × 2 dias · valor do motorista; R$${NON_BREAKING_SPACE}200,00 × 2 dias · valor padrão`,
      }),
    )
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
            freightRuleId: null,
            freightRuleName: null,
            percentage: null,
            source: 'measured',
            tripDocumentId: 'a',
          },
          {
            amount: '0.0000',
            gap: 'NO_FREIGHT_RULE',
            nfeDocumentId: null,
            freightRuleId: null,
            freightRuleName: null,
            percentage: null,
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
   * O valor pago ao motorista é dado sensível **para o próprio motorista**, que tem `trip.read`, e
   * para quem senta ao lado dele no barracão. A lista abaixo é nominal de propósito.
   *
   * ADR-0049 §6, **emendada**: o `operator` entrou. Ele é o atendente que monta o roteiro e escolhe
   * a carga, e escolher sem ver o custo é escolher no escuro — a receita sozinha não diz se a
   * viagem vale a pena. O `separator` continua fora: ele executa a carga que já foi escolhida.
   */
  test('alcança quem escolhe a carga e o financeiro, nunca o barracão nem a rua', () => {
    for (const role of ['company-admin', 'finance', 'operator'] as const) {
      expect(() => service.authorize(contextFor(role), POLICY)).not.toThrow()
    }

    for (const role of ['driver', 'aggregate', 'separator', 'fiscal'] as const) {
      expect(() => service.authorize(contextFor(role), POLICY)).toThrow()
    }
  })
})
