import { describe, expect, test } from 'bun:test'

import {
  buildProposalVehicleViews,
  PROPOSAL_CITY_LIMIT,
  summarizeProposalCities,
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
})
