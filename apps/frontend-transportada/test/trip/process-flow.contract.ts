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
  test('as fases são a máquina da nota, na ordem em que ela anda', () => {
    expect([...TRIP_PROCESS_STAGES]).toEqual(['pending', 'separated', 'loaded', 'delivered'])
  })

  /**
   * ⚠️ **Cumulativo, não exclusivo.** A nota carregada já passou por separada: contá-la só na
   * coluna atual faria a fase anterior regredir enquanto o trabalho anda — que é exatamente o que a
   * porcentagem por status mostrava.
   */
  test('a nota conta em toda fase por onde já passou', () => {
    const fluxo = buildTripProcessFlow([nota('loaded'), nota('pending')])

    expect(fluxo?.stages.map((stage) => [stage.stage, stage.reached])).toEqual([
      ['pending', 2],
      ['separated', 1],
      ['loaded', 1],
      ['delivered', 0],
    ])
  })

  test('a fase atual é a última que alguma nota alcançou', () => {
    expect(buildTripProcessFlow([nota('pending')])?.currentStage).toBe('pending')
    expect(buildTripProcessFlow([nota('loaded'), nota('pending')])?.currentStage).toBe('loaded')
    expect(buildTripProcessFlow([nota('delivered')])?.currentStage).toBe('delivered')
  })

  /** A devolvida saiu do fluxo: contá-la como fase faria a fila ter um fim que não é o fim. */
  test('a devolvida é desvio, não fase', () => {
    const fluxo = buildTripProcessFlow([nota('returned'), nota('delivered')])

    expect(fluxo?.returned).toBe(1)
    expect(fluxo?.stages.map((stage) => stage.stage)).not.toContain('returned')
  })

  /** Sem nota não há processo — desenhar a fila vazia sugeriria viagem parada na primeira fase. */
  test('viagem sem nota não tem fluxo', () => {
    expect(buildTripProcessFlow([])).toBeNull()
  })

  test('a tela desenha o fluxo, e a animação respeita quem pediu menos movimento', async () => {
    const [componente, estilo] = await Promise.all([
      Bun.file(
        new URL('src/modules/trip/components/TripProcessFlow.component.tsx', APPLICATION_ROOT),
      ).text(),
      Bun.file(new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT)).text(),
    ])

    expect(componente).toContain('buildTripProcessFlow(documents)')
    expect(estilo).toContain('prefers-reduced-motion')
  })
})
