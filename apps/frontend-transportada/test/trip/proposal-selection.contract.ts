import { describe, expect, test } from 'bun:test'

import {
  summarizeProposalSelection,
  toggleAllProposalSelection,
  toggleProposalSelection,
  type ProposalSelectionVehicle,
} from '@/modules/trip/shared/proposalSelection.service'

/**
 * Spec 110 D5: **aceitar tudo, ou só o que serve.** Uma viagem com o caminhão errado obrigava a
 * descartar as quatro e refazer o pedido inteiro.
 *
 * ⚠️ Os totais são **do que está marcado**. É o ponto da tela: comparar aceitar tudo com aceitar
 * parte é a decisão, e um total fixo não ajuda a tomá-la.
 */
const VEHICLES: readonly ProposalSelectionVehicle[] = [
  {
    deliveries: 12,
    distanceMeters: 184_200,
    durationSeconds: 22_800,
    hasGaps: false,
    tollAmount: '312.80',
    totalCost: '3108.03',
    totalMargin: '1211.97',
    totalRevenue: '4320.00',
    vehicleId: 'v-1',
  },
  {
    deliveries: 7,
    distanceMeters: 71_800,
    durationSeconds: 11_400,
    hasGaps: true,
    tollAmount: '148.20',
    totalCost: '488.23',
    totalMargin: '1491.77',
    totalRevenue: '1980.00',
    vehicleId: 'v-2',
  },
]

describe('proposal selection contract', () => {
  test('tudo marcado soma as duas viagens', () => {
    const summary = summarizeProposalSelection({
      selected: new Set(['v-1', 'v-2']),
      vehicles: VEHICLES,
    })

    expect(summary.selectedCount).toBe(2)
    expect(summary.deliveries).toBe(19)
    expect(summary.totalRevenue).toBe('6300.00')
    expect(summary.totalCost).toBe('3596.26')
    expect(summary.totalToll).toBe('461.00')
    expect(summary.allSelected).toBe(true)
    expect(summary.indeterminate).toBe(false)
  })

  /**
   * ⚠️ **Desmarcar a viagem incompleta tira a marca do conjunto.** Se a marca ficasse, ela mentiria
   * sobre uma seleção que está inteira — e é justamente com ela que o operador decide.
   */
  test('a marca de conta incompleta é da seleção, não da proposta', () => {
    const withGap = summarizeProposalSelection({
      selected: new Set(['v-1', 'v-2']),
      vehicles: VEHICLES,
    })
    const withoutGap = summarizeProposalSelection({
      selected: new Set(['v-1']),
      vehicles: VEHICLES,
    })

    expect(withGap.hasGaps).toBe(true)
    expect(withoutGap.hasGaps).toBe(false)
  })

  test('seleção parcial é indeterminada, e diz o que volta para o maço', () => {
    const summary = summarizeProposalSelection({ selected: new Set(['v-1']), vehicles: VEHICLES })

    expect(summary.indeterminate).toBe(true)
    expect(summary.allSelected).toBe(false)
    expect(summary.releasedTrips).toBe(1)
    expect(summary.releasedDeliveries).toBe(7)
  })

  test('nada marcado não é indeterminado, e não solta nada em dobro', () => {
    const summary = summarizeProposalSelection({ selected: new Set(), vehicles: VEHICLES })

    expect(summary.indeterminate).toBe(false)
    expect(summary.allSelected).toBe(false)
    expect(summary.selectedCount).toBe(0)
    expect(summary.totalRevenue).toBe('0.00')
    expect(summary.releasedDeliveries).toBe(19)
  })

  /**
   * ⚠️ Distância desconhecida em **qualquer** veículo marcado torna o conjunto desconhecido — nunca
   * uma soma parcial com cara de completa. É a mesma regra do peso estimado: o pior caso vence.
   */
  test('rodagem desconhecida de um torna a do conjunto desconhecida', () => {
    const summary = summarizeProposalSelection({
      selected: new Set(['v-1', 'v-3']),
      vehicles: [
        ...VEHICLES,
        {
          deliveries: 3,
          distanceMeters: null,
          durationSeconds: null,
          hasGaps: false,
          tollAmount: null,
          totalCost: '100.00',
          totalMargin: '50.00',
          totalRevenue: '150.00',
          vehicleId: 'v-3',
        },
      ],
    })

    expect(summary.totalDistanceMeters).toBeNull()
    expect(summary.totalDurationSeconds).toBeNull()
    /** ⚠️ E o pedágio some junto: praça sem tarifa somada como zero seria um total mais barato. */
    expect(summary.totalToll).toBeNull()
  })

  test('marcar e desmarcar uma viagem', () => {
    const first = toggleProposalSelection({ selected: new Set(['v-1']), vehicleId: 'v-2' })
    expect([...first].sort()).toEqual(['v-1', 'v-2'])

    const second = toggleProposalSelection({ selected: first, vehicleId: 'v-1' })
    expect([...second]).toEqual(['v-2'])
  })

  /** "Selecionar todas" alterna: quem marcou tudo por engano desfaz num clique, não em quatro. */
  test('selecionar todas alterna', () => {
    const all = toggleAllProposalSelection({ selected: new Set(['v-1']), vehicles: VEHICLES })
    expect([...all].sort()).toEqual(['v-1', 'v-2'])

    expect([...toggleAllProposalSelection({ selected: all, vehicles: VEHICLES })]).toEqual([])
  })
})
