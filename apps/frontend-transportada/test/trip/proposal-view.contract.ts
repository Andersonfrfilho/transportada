import { describe, expect, test } from 'bun:test'

import { resolveLeftoverStops } from '@/modules/routing/shared/suggestionLeftover.service'

import {
  buildProposalVehicleViews,
  countOverPayload,
  isOverPayload,
  PROPOSAL_CITY_LIMIT,
  summarizeProposalCities,
  type ProposalVehicleView,
} from '@/modules/trip/shared/proposalView.service'
import type { ProposalStop } from '@/modules/trip/shared/trip.types'

const STOP = (overrides: Partial<ProposalStop>): ProposalStop => ({
  distanceFromPreviousMeters: null,
  durationFromPreviousSeconds: null,
  estimatedArrivalAt: null,
  excludedFromOptimization: false,
  geocodingPrecision: null,
  label: 'Ribeirão Preto',
  nfeDocumentIds: ['doc-1'],
  sequence: 1,
  vehicleId: 'v-1',
  ...overrides,
})

describe('proposal view contract', () => {
  /** ⚠️ A nota conta **uma vez por veículo**: a mesma nota em duas paradas é uma entrega. */
  test('a nota repetida em duas paradas do mesmo caminhão é uma entrega só', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map(),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [
        STOP({ nfeDocumentIds: ['doc-1', 'doc-2'] }),
        STOP({ label: 'Sertãozinho', nfeDocumentIds: ['doc-2'], sequence: 2 }),
      ],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.deliveries).toBe(2)
    expect(view?.cities).toEqual(['Ribeirão Preto', 'Sertãozinho'])
  })

  /** Parada sem veículo é sobra, e sobra tem painel próprio — contá-la a faria parecer distribuída. */
  test('a parada sem veículo não entra em viagem nenhuma', () => {
    const views = buildProposalVehicleViews({
      documentsById: new Map(),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({ nfeDocumentIds: ['doc-9'], vehicleId: null })],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(views).toEqual([])
  })

  /** ⚠️ ADR-0052: **uma nota estimada marca o veículo inteiro**, e a soma ignora quem não declara. */
  test('o peso soma o declarado e leva a marca do estimado', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map([
        ['doc-1', { cargoGrossWeight: '108.6700', cargoWeightSource: 'xml' as const }],
        ['doc-2', { cargoGrossWeight: '40.0000', cargoWeightSource: 'estimated' as const }],
        ['doc-3', { cargoGrossWeight: null, cargoWeightSource: null }],
      ]),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({ nfeDocumentIds: ['doc-1', 'doc-2', 'doc-3'] })],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.weightKilograms).toBe('148.6700')
    expect(view?.weightEstimated).toBe(true)
  })

  test('sem nota com massa declarada o peso é ausência, nunca zero', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map([['doc-1', { cargoGrossWeight: null, cargoWeightSource: null }]]),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.weightKilograms).toBeNull()
    expect(view?.weightEstimated).toBe(false)
  })
  /**
   * Spec 110 D2: **as cidades têm teto.** Medido em 2026-09-09 na distribuição real: uma linha com
   * dezessete cidades quebrava em três linhas e desalinhava a grade de números ao lado — a grade de
   * largura fixa existe justamente para os valores se compararem entre linhas.
   */
  test('acima do teto as cidades são resumidas, e o resto é contado', () => {
    const cities = ['SEBRANA', 'SERRA AZUL', 'CAJURU', 'DUMONT', 'ITOBI', 'BARRINHA']
    const [view] = buildProposalVehicleViews({
      documentsById: new Map(),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: cities.map((label, index) =>
        STOP({ label, nfeDocumentIds: [`doc-${index}`], sequence: index + 1 }),
      ),
      valuation: null,
      vehicleById: new Map(),
    })

    const summary = summarizeProposalCities(view?.cities ?? [])

    expect(summary.shown).toHaveLength(PROPOSAL_CITY_LIMIT)
    expect(summary.hidden).toBe(cities.length - PROPOSAL_CITY_LIMIT)
  })

  /**
   * ⚠️ **Dinheiro ausente é ausência.** `?? ZERO` imprimia `R$ 0,00` na viagem cuja conta ainda não
   * chegou (a conta é uma segunda consulta, e ela só liga com `trip.financials` e a sugestão
   * pronta) — e uma viagem que rende R$ 1.200 apresentada como R$ 0,00 é o número que faz alguém
   * descartar a distribuição certa.
   */
  test('sem conta os valores são ausência, nunca zero', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map(),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.totalCost).toBeNull()
    expect(view?.totalRevenue).toBeNull()
    expect(view?.totalMargin).toBeNull()
  })

  /**
   * ⚠️ **Quem dirige sai do par, não da conta.** Lendo o motorista da conta, toda linha dizia "Sem
   * motorista" enquanto a conta não chegava — numa distribuição em que o operador acabara de
   * escolher seis motoristas, um por caminhão.
   */
  test('o motorista vem do par escolhido mesmo sem conta', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map(),
      driverIdByVehicleId: new Map([['v-1', 'd-1']]),
      driverNameById: new Map([['d-1', 'Marcos Pereira']]),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.driverName).toBe('Marcos Pereira')
  })
  /**
   * ⚠️ **A carga que não cabe é dita na linha fechada.** Medido em 2026-09-09, na distribuição
   * real: quatro dos cinco caminhões nasceram acima do teto — a Fiorino de 650 kg com 4.307,57 kg,
   * 663% — e a única marca disso vivia dentro do expandido, um veículo por vez. Peso declarado em
   * MDF-e não admite tolerância (Res. CONTRAN 882/2021, Art. 49 §3º).
   */
  test('a viagem acima do teto de peso é acusada, e o estouro sai como está', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map([
        ['doc-1', { cargoGrossWeight: '4307.5700', cargoWeightSource: 'xml' as const }],
      ]),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map([
        [
          'v-1',
          {
            capacityKilograms: '650.00',
            label: 'Fiat Fiorino',
            plate: 'RTF7L01',
            type: 'utility' as const,
          },
        ],
      ]),
    })

    expect(view?.maxPayloadKilograms).toBe('650.00')
    expect(Math.round((view?.payloadRatio ?? 0) * 100)).toBe(663)
    expect(isOverPayload(view as ProposalVehicleView)).toBe(true)
  })

  /** ⚠️ Zero na ficha é ausência de medida, nunca teto de zero quilo (spec 088). */
  test('ficha sem teto não vira percentual nenhum', () => {
    const [view] = buildProposalVehicleViews({
      documentsById: new Map([
        ['doc-1', { cargoGrossWeight: '1000.0000', cargoWeightSource: 'xml' as const }],
      ]),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map([
        [
          'v-1',
          {
            capacityKilograms: '0.00',
            label: 'Sem ficha',
            plate: 'AAA0A00',
            type: 'truck' as const,
          },
        ],
      ]),
    })

    expect(view?.maxPayloadKilograms).toBeNull()
    expect(view?.payloadRatio).toBeNull()
    expect(isOverPayload(view as ProposalVehicleView)).toBe(false)
  })

  /** O aviso do aceite conta **as marcadas**: desmarcar a viagem estourada tira o aviso com ela. */
  test('o aviso do aceite conta só as viagens marcadas', () => {
    const views = buildProposalVehicleViews({
      documentsById: new Map([
        ['doc-1', { cargoGrossWeight: '4307.5700', cargoWeightSource: 'xml' as const }],
        ['doc-2', { cargoGrossWeight: '100.0000', cargoWeightSource: 'xml' as const }],
      ]),
      driverIdByVehicleId: new Map(),
      driverNameById: new Map(),
      stops: [STOP({}), STOP({ nfeDocumentIds: ['doc-2'], sequence: 2, vehicleId: 'v-2' })],
      valuation: null,
      vehicleById: new Map([
        [
          'v-1',
          {
            capacityKilograms: '650.00',
            label: 'Fiat Fiorino',
            plate: 'RTF7L01',
            type: 'utility' as const,
          },
        ],
        [
          'v-2',
          {
            capacityKilograms: '4200.00',
            label: 'Accelo',
            plate: 'RTD5J78',
            type: 'three_quarter' as const,
          },
        ],
      ]),
    })

    expect(countOverPayload(views, new Set(['v-1', 'v-2']))).toBe(1)
    expect(countOverPayload(views, new Set(['v-2']))).toBe(0)
  })
  /**
   * ⚠️ **A proposta conta o que ficou de fora dela.** Medido em 2026-09-09, depois do corte por
   * capacidade: 345 notas escolhidas, "180 entregas" anunciadas, e 165 caladas — 148 que não
   * couberam na frota e 17 de endereço impreciso. Sugestão que devolve parte e não conta o resto
   * **parece completa**, e o operador descobre a carga esquecida no dia seguinte (spec 107).
   */
  test('a sobra é contada por razão, em notas', () => {
    const leftovers = resolveLeftoverStops([
      { excludedFromOptimization: false, label: 'FRANCA', nfeDocumentIds: ['a'], vehicleId: 'v-1' },
      {
        excludedFromOptimization: false,
        label: 'BATATAIS',
        leftoverReason: 'over_capacity',
        nfeDocumentIds: ['b', 'c'],
        vehicleId: null,
      },
      {
        excludedFromOptimization: true,
        label: 'ITOBI',
        leftoverReason: 'imprecise_location',
        nfeDocumentIds: ['d'],
        vehicleId: null,
      },
    ])

    expect(leftovers.map((stop) => stop.reason)).toEqual(['over_capacity', 'imprecise_location'])
  })

  /**
   * ⚠️ **A razão declarada vence a derivada.** Sem isso, a carga que não coube seria rotulada "sem
   * motorista que cubra a região" — e o operador cadastraria cobertura para resolver tonelagem.
   */
  test('sem razão declarada a derivação antiga continua valendo', () => {
    const leftovers = resolveLeftoverStops([
      { excludedFromOptimization: false, label: 'X', nfeDocumentIds: ['a'], vehicleId: null },
      { excludedFromOptimization: true, label: 'Y', nfeDocumentIds: ['b'], vehicleId: null },
    ])

    expect(leftovers.map((stop) => stop.reason)).toEqual(['not_covered', 'imprecise_location'])
  })
})
