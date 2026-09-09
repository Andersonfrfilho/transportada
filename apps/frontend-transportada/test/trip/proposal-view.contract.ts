import { describe, expect, test } from 'bun:test'

import { buildProposalVehicleViews } from '@/modules/trip/shared/proposalView.service'
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
      driverNameById: new Map(),
      stops: [STOP({})],
      valuation: null,
      vehicleById: new Map(),
    })

    expect(view?.weightKilograms).toBeNull()
    expect(view?.weightEstimated).toBe(false)
  })
})
