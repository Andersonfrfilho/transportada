/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  buildSuggestionValuationReport,
  isReturnPlanned,
  sumVehicleTrip,
  type SuggestionVehicleValuation,
} from '../../src/routing/domain/suggestion-valuation.policy.js'

/**
 * ⚠️ Sem `??`: `null` aqui é o caso que os testes existem para cobrir, e o coalescing o
 * transformaria calado no padrão — o helper afirmaria o oposto do que o nome do teste diz.
 */
function stop(overrides: {
  readonly distanceFromPreviousMeters: null | number
  readonly durationFromPreviousSeconds: null | number
}) {
  return overrides
}

function vehicle(overrides: Partial<SuggestionVehicleValuation> = {}): SuggestionVehicleValuation {
  return {
    distanceMeters: 100_000,
    distanceParts: { outboundMeters: 100_000, returnMeters: null, returnStatus: 'not_planned' },
    documentCount: 3,
    driverId: null,
    durationParts: {
      drivingSeconds: 3_600,
      returnSeconds: null,
      returnStatus: 'not_planned',
      serviceSeconds: 0,
    },
    durationSeconds: 3_600,
    stopCount: 2,
    valuation: {
      costParcels: [],
      hasGaps: false,
      marginPercentage: '50.0000',
      revenueLines: [],
      revenueSource: 'estimated',
      totalCost: '100.0000',
      totalMargin: '100.0000',
      totalRevenue: '200.0000',
    },
    vehicleId: '00000000-0000-4000-8000-0000000000a1',
    ...overrides,
  }
}

/** A estrada de ida, sem volta e sem parada — o que as pernas sozinhas dizem. */
function roadOnly(stops: readonly ReturnType<typeof stop>[]) {
  return sumVehicleTrip({
    isReturnPlanned: false,
    returnLeg: null,
    stops: stops.map((entry) => ({ ...entry, serviceTimeSeconds: 0 })),
  })
}

describe('sumVehicleTrip — a estrada de ida', () => {
  /**
   * A primeira parada de um veículo não tem perna anterior, e a parada excluída da otimização
   * também não. `null` ali é o normal, não falta de dado.
   */
  it('a perna ausente da primeira parada não impede a soma', () => {
    const trip = roadOnly([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
      stop({ distanceFromPreviousMeters: 12_000, durationFromPreviousSeconds: 900 }),
    ])

    expect(trip.distanceMeters).toBe(12_000)
    expect(trip.durationParts.drivingSeconds).toBe(900)
  })

  it('soma as pernas de todas as paradas do veículo', () => {
    const trip = roadOnly([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
      stop({ distanceFromPreviousMeters: 10_000, durationFromPreviousSeconds: 600 }),
      stop({ distanceFromPreviousMeters: 5_000, durationFromPreviousSeconds: 300 }),
    ])

    expect(trip.distanceMeters).toBe(15_000)
    expect(trip.durationSeconds).toBe(900)
  })

  /**
   * ⚠️ Veículo sem nenhuma perna conhecida é distância **desconhecida**, nunca zero: zero desceria
   * o combustível a nada e a margem apareceria melhor do que é — o modo de falha que a ADR-0049 §2
   * proíbe.
   */
  it('sem nenhuma perna conhecida a distância é ausência, não zero', () => {
    const trip = roadOnly([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
    ])

    expect(trip.distanceMeters).toBe(null)
    expect(trip.durationSeconds).toBe(null)
  })

  it('parada nenhuma é ausência', () => {
    const trip = roadOnly([])

    expect(trip.distanceMeters).toBe(null)
    expect(trip.durationSeconds).toBe(null)
  })
})

/**
 * Decisão do usuário (2026-09-13): **uma conta só de tempo.** O cartão, a faixa do detalhe e a
 * frase do mapa mostram o mesmo número = estrada de ida + volta ao barracão (quando a política
 * manda voltar) + tempo parado de **todas** as entregas, inclusive a primeira.
 *
 * O cenário é a viagem de 24 entregas medida: 4 h 28 min de estrada (16 080 s), 20 min parados em
 * cada entrega (24 × 1 200 s = 8 h) e 1 h 2 min de volta (3 720 s).
 */
describe('sumVehicleTrip — o tempo da viagem proposta', () => {
  const TWENTY_MINUTES = 1_200
  const deliveries = Array.from({ length: 24 }, (_entry, index) => ({
    distanceFromPreviousMeters: index === 0 ? 60_000 : 8_000,
    durationFromPreviousSeconds: index === 0 ? 6_880 : 400,
    serviceTimeSeconds: TWENTY_MINUTES,
  }))

  it('24 entregas × 20 min são 8 h paradas, somadas à estrada e à volta', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: true,
      returnLeg: { distanceMeters: 70_000, durationSeconds: 3_720 },
      stops: deliveries,
    })

    expect(trip.durationParts).toEqual({
      drivingSeconds: 16_080,
      returnSeconds: 3_720,
      returnStatus: 'included',
      serviceSeconds: 28_800,
    })
    /** 16 080 + 3 720 + 28 800 = 48 600 s = 13 h 30 min. */
    expect(trip.durationSeconds).toBe(48_600)
  })

  /**
   * Decisão do usuário (2026-09-13, segunda parte): a volta ao barracão entra também na
   * **distância** — e, por ela, no combustível e no lucro. Ida 244 km + volta 70 km = 314 km.
   */
  it('a volta gravada entra na distância: ida + volta', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: true,
      returnLeg: { distanceMeters: 70_000, durationSeconds: 3_720 },
      stops: deliveries,
    })

    expect(trip.distanceMeters).toBe(314_000)
    expect(trip.distanceParts).toEqual({
      outboundMeters: 244_000,
      returnMeters: 70_000,
      returnStatus: 'included',
    })
  })

  /** Sugestão antiga, sem a volta gravada: a distância é só a ida, e a volta sai desconhecida. */
  it('volta esperada e não gravada não entra na distância, e fica desconhecida', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: true,
      returnLeg: { distanceMeters: null, durationSeconds: null },
      stops: deliveries,
    })

    expect(trip.distanceMeters).toBe(244_000)
    expect(trip.distanceParts).toEqual({
      outboundMeters: 244_000,
      returnMeters: null,
      returnStatus: 'unknown',
    })
  })

  /** `last_stop`: a volta gravada (se houver) não é da viagem — nem distância, nem lacuna. */
  it('sem retorno pela política a distância é só a ida', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: false,
      returnLeg: { distanceMeters: 70_000, durationSeconds: 3_720 },
      stops: deliveries,
    })

    expect(trip.distanceMeters).toBe(244_000)
    expect(trip.distanceParts.returnStatus).toBe('not_planned')
  })

  /** Ida desconhecida continua desconhecida: a volta sozinha não vira distância da viagem. */
  it('sem ida conhecida a distância é ausência, mesmo com a volta gravada', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: true,
      returnLeg: { distanceMeters: 70_000, durationSeconds: 3_720 },
      stops: [
        {
          distanceFromPreviousMeters: null,
          durationFromPreviousSeconds: null,
          serviceTimeSeconds: 0,
        },
      ],
    })

    expect(trip.distanceMeters).toBe(null)
  })

  /**
   * ⚠️ Sugestão anterior à coluna da volta: a política mandava voltar e ninguém gravou a perna. O
   * total **não inventa** volta — e diz que ela é desconhecida, para a tela poder dizer isso.
   */
  it('volta esperada e não gravada fica desconhecida, nunca zero calado', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: true,
      returnLeg: { distanceMeters: null, durationSeconds: null },
      stops: deliveries,
    })

    expect(trip.durationParts.returnStatus).toBe('unknown')
    expect(trip.durationParts.returnSeconds).toBe(null)
    expect(trip.durationSeconds).toBe(16_080 + 28_800)
  })

  it('sem retorno pela política a volta não existe, e não é lacuna', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: false,
      returnLeg: null,
      stops: deliveries,
    })

    expect(trip.durationParts.returnStatus).toBe('not_planned')
    expect(trip.durationSeconds).toBe(44_880)
  })

  /** Parada sem tempo parado gravado não para: nulo aqui é ausência de serviço, somada como zero. */
  it('parada sem tempo parado gravado não soma parada', () => {
    const trip = sumVehicleTrip({
      isReturnPlanned: false,
      returnLeg: null,
      stops: [
        {
          distanceFromPreviousMeters: 1_000,
          durationFromPreviousSeconds: 60,
          serviceTimeSeconds: null,
        },
      ],
    })

    expect(trip.durationParts.serviceSeconds).toBe(0)
    expect(trip.durationSeconds).toBe(60)
  })
})

describe('isReturnPlanned', () => {
  /** ADR-0044 §5: `last_stop` fecha o dia onde está; barracão e endereço próprio pedem a volta. */
  it('só a política last_stop dispensa a volta', () => {
    expect(isReturnPlanned('depot')).toBe(true)
    expect(isReturnPlanned('address')).toBe(true)
    expect(isReturnPlanned('last_stop')).toBe(false)
  })
})

describe('buildSuggestionValuationReport', () => {
  it('soma receita, custo e margem dos veículos', () => {
    const report = buildSuggestionValuationReport({ vehicles: [vehicle(), vehicle()] })

    expect(report.totalRevenue).toBe('400.0000')
    expect(report.totalCost).toBe('200.0000')
    expect(report.totalMargin).toBe('200.0000')
    expect(report.hasGaps).toBe(false)
    expect(report.gaps).toEqual([])
  })

  /**
   * ⚠️ **Soma, não máximo.** São caminhões distintos rodando em paralelo, e a pergunta que o
   * relatório responde é quanto custa operar o conjunto — não quando o último chega. Se um dia
   * quisermos a segunda pergunta, ela é um campo novo, nunca a troca deste.
   */
  it('o tempo total é a soma das durações, nunca o máximo', () => {
    const report = buildSuggestionValuationReport({
      vehicles: [vehicle({ durationSeconds: 3_600 }), vehicle({ durationSeconds: 7_200 })],
    })

    expect(report.totalDurationSeconds).toBe(10_800)
  })

  it('a distância total é a soma, e o veículo sem distância não vira zero', () => {
    const report = buildSuggestionValuationReport({
      vehicles: [
        vehicle({ distanceMeters: 100_000 }),
        vehicle({ distanceMeters: null, durationSeconds: null }),
      ],
    })

    expect(report.totalDistanceMeters).toBe(100_000)
    expect(report.hasGaps).toBe(true)
  })

  /**
   * A lacuna de um veículo contamina o conjunto: o total deixa de ser uma previsão fechada, e é a
   * marca ao lado do número que diz isso a quem decide aceitar a distribuição.
   */
  it('a lacuna de um veículo torna o conjunto incompleto', () => {
    const withGap = vehicle({
      valuation: {
        ...vehicle().valuation,
        costParcels: [
          {
            amount: '0.0000',
            detail: null,
            gap: 'NO_FUEL_PRICE',
            kind: 'fuel',
            source: 'missing',
          },
        ],
        hasGaps: true,
      },
    })

    const report = buildSuggestionValuationReport({ vehicles: [vehicle(), withGap] })

    expect(report.hasGaps).toBe(true)
    expect(report.gaps).toEqual(['NO_FUEL_PRICE'])
  })

  /** A mesma lacuna em dois veículos é um motivo, não dois: a lista é do conjunto. */
  it('lacunas repetidas aparecem uma vez só', () => {
    const withGap = vehicle({
      valuation: {
        ...vehicle().valuation,
        costParcels: [
          { amount: '0.0000', detail: null, gap: 'NO_FUEL_PRICE', kind: 'fuel', source: 'missing' },
        ],
        hasGaps: true,
      },
    })

    const report = buildSuggestionValuationReport({ vehicles: [withGap, withGap] })

    expect(report.gaps).toEqual(['NO_FUEL_PRICE'])
  })

  it('conjunto vazio soma zero e não inventa lacuna', () => {
    const report = buildSuggestionValuationReport({ vehicles: [] })

    expect(report.totalRevenue).toBe('0.0000')
    expect(report.totalCost).toBe('0.0000')
    expect(report.totalDistanceMeters).toBe(null)
    expect(report.totalDurationSeconds).toBe(null)
    expect(report.hasGaps).toBe(false)
  })
})
