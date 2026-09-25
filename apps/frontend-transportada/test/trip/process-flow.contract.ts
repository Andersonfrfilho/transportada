/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_PROCESS_STAGES,
  buildTripProcessFlow,
} from '@/modules/trip/shared/tripProcessFlow.service'
import type { TripDocumentDetail } from '@/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function nota(separationStatus: TripDocumentDetail['separationStatus']): TripDocumentDetail {
  return {
    createdAt: '2026-09-01T10:00:00.000Z',
    cteAuthorized: false,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: crypto.randomUUID(),
    loadedAt: null,
    nfeDocumentId: null,
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus,
    stopId: null,
    tripId: '00000000-0000-4000-8000-000000000001',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
}

/**
 * A barra mostrava **porcentagem por status** — `Carregada (75%)`, `Pendente (25%)` — e isso não é
 * o andamento: são quatro números que somam cem e não dizem em que fase a viagem está. O processo é
 * uma fila de fases por onde cada nota passa, e o que interessa é quantas já passaram de cada uma.
 */
describe('o processo da viagem, por fase', () => {
  test('as fases são a máquina da nota, mais "despachada" (viagem, não nota) antes de entregue', () => {
    expect([...TRIP_PROCESS_STAGES]).toEqual([
      'pending',
      'separated',
      'loaded',
      'dispatched',
      'delivered',
    ])
  })

  /**
   * ⚠️ **Cumulativo, não exclusivo.** A nota carregada já passou por separada: contá-la só na
   * coluna atual faria a fase anterior regredir enquanto o trabalho anda — que é exatamente o que a
   * porcentagem por status mostrava.
   */
  test('a nota conta em toda fase por onde já passou', () => {
    const fluxo = buildTripProcessFlow([nota('loaded'), nota('pending')], 'loading')

    expect(fluxo?.stages.map((stage) => [stage.stage, stage.reached])).toEqual([
      ['pending', 2],
      ['separated', 1],
      ['loaded', 1],
      ['dispatched', 0],
      ['delivered', 0],
    ])
  })

  test('a fase atual é a última que alguma nota alcançou', () => {
    expect(buildTripProcessFlow([nota('pending')], 'route_planned')?.currentStage).toBe('pending')
    expect(buildTripProcessFlow([nota('loaded'), nota('pending')], 'loading')?.currentStage).toBe(
      'loaded',
    )
    expect(buildTripProcessFlow([nota('delivered')], 'completed')?.currentStage).toBe('delivered')
  })

  /**
   * Spec 185 (ADR-0074 §6): "despachada" não é status de nota — não existe `separationStatus:
   * 'dispatched'`. A viagem inteira alcança a fase de uma vez, quando `trips.status` chega lá.
   */
  describe('"despachada" é do status da viagem, não da nota (spec 185 T6.1)', () => {
    test('viagem ainda não despachada não alcança a fase, mesmo com tudo carregado', () => {
      const fluxo = buildTripProcessFlow([nota('loaded'), nota('loaded')], 'loading')

      expect(fluxo?.stages.find((stage) => stage.stage === 'dispatched')?.reached).toBe(0)
    })

    test('viagem despachada, em trânsito ou concluída marca a fase para toda nota viva', () => {
      for (const status of [
        'dispatched',
        'in_transit',
        'on_delivery_route',
        'completed',
      ] as const) {
        const fluxo = buildTripProcessFlow([nota('loaded'), nota('delivered')], status)
        expect(fluxo?.stages.find((stage) => stage.stage === 'dispatched')?.reached).toBe(2)
      }
    })

    /** A devolvida é desvio em toda fase, inclusive nesta — ela nunca esteve no caminhão. */
    test('a nota devolvida não conta para "despachada"', () => {
      const fluxo = buildTripProcessFlow([nota('returned'), nota('delivered')], 'completed')

      expect(fluxo?.stages.find((stage) => stage.stage === 'dispatched')?.reached).toBe(1)
    })

    test('a fase atual acompanha o despacho quando nenhuma nota entregou ainda', () => {
      expect(buildTripProcessFlow([nota('loaded')], 'dispatched')?.currentStage).toBe('dispatched')
    })
  })

  /** A devolvida saiu do fluxo: contá-la como fase faria a fila ter um fim que não é o fim. */
  test('a devolvida é desvio, não fase', () => {
    const fluxo = buildTripProcessFlow([nota('returned'), nota('delivered')], 'completed')

    expect(fluxo?.returned).toBe(1)
    expect(fluxo?.stages.map((stage) => stage.stage)).not.toContain('returned')
  })

  /** Sem nota não há processo — desenhar a fila vazia sugeriria viagem parada na primeira fase. */
  test('viagem sem nota não tem fluxo', () => {
    expect(buildTripProcessFlow([], 'draft')).toBeNull()
  })

  test('a tela desenha o fluxo, e a animação respeita quem pediu menos movimento', async () => {
    const [componente, estilo] = await Promise.all([
      Bun.file(
        new URL('src/modules/trip/components/TripProcessFlow.component.tsx', APPLICATION_ROOT),
      ).text(),
      Bun.file(new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT)).text(),
    ])

    expect(componente).toContain('buildTripProcessFlow(documents, tripStatus)')
    expect(estilo).toContain('prefers-reduced-motion')
  })
})
