/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.3 (ADR-0100 §6, CA14): na montagem, quando o solver termina, UMA chamada a `day-checks` leva os pares
 * cidade e dia das paradas e o aviso volta por parada, no lugar do aviso só nacional do término. Rota que cai devolve
 * ao aviso nacional de hoje, sem derrubar o roteiro. Dados sintéticos.
 */
import { act } from 'react'
import { describe, expect, it } from 'bun:test'

import { useSolverCityOrder } from '../../src/modules/trip/hooks/useSolverCityOrder.hook'
import type { DayChecksClient } from '../../src/modules/trip/shared/dayChecksClient.service'
import type { HolidayWarning } from '../../src/modules/trip/shared/trip.types'

import {
  buildAssemblyPoint,
  buildSolverClient,
  buildSolverSuggestion,
  type SolverStopInput,
} from '../fixtures/solverSuggestion.fixture'

import { renderHook, waitFor } from './renderHook.helper'

const CAMPINAS_KEY = '3509502|13010001|45'
const CAMPINAS_OTHER_KEY = '3509502|13010002|10'
const CURITIBA_KEY = '4106902|80010000|S/N'

const warning: HolidayWarning = {
  cityIbgeCode: 3509502,
  date: '2026-12-25',
  reasons: [{ name: 'christmas', origin: 'code', scope: 'national' }],
}

/** 25/12/2026 é sexta: o feriado do dia é a única razão do aviso (o fim de semana não entra). */
const CHRISTMAS_STOPS: readonly SolverStopInput[] = [
  { addressKey: CAMPINAS_KEY, estimatedArrivalAt: '2026-12-25T13:00:00.000Z', sequence: 1 },
  { addressKey: CAMPINAS_OTHER_KEY, estimatedArrivalAt: '2026-12-25T15:00:00.000Z', sequence: 2 },
  { addressKey: CURITIBA_KEY, estimatedArrivalAt: '2026-12-25T18:00:00.000Z', sequence: 3 },
]

type Calls = { items: (readonly { cityIbgeCode: string; date: string }[])[] }

function dayChecksClient(
  calls: Calls,
  answer: () => Promise<readonly HolidayWarning[]>,
): DayChecksClient {
  return {
    check: (items) => {
      calls.items.push(items)
      return answer()
    },
  }
}

async function runSolver(
  input: Readonly<{
    dayChecks: DayChecksClient
    stops: readonly SolverStopInput[]
    status?: 'failed' | 'ready'
  }>,
) {
  const hook = await renderHook(() =>
    useSolverCityOrder({
      client: buildSolverClient(buildSolverSuggestion(input.stops, input.status ?? 'ready')),
      dayChecksClient: input.dayChecks,
      order: input.stops.map((stop) => stop.addressKey),
      points: [
        buildAssemblyPoint({ id: 'n1', stopKey: CAMPINAS_KEY }),
        buildAssemblyPoint({ id: 'n2', stopKey: CURITIBA_KEY }),
      ],
      vehicleId: 'vehicle-1',
    }),
  )
  await requestSolver(hook)
  return hook
}

/** O pedido roda dentro de `act`: o estado que ele muda ao terminar tem de estar renderizado quando se lê. */
async function requestSolver(hook: Readonly<{ result: () => { request: () => Promise<void> } }>) {
  await act(async () => {
    await hook.result().request()
  })
}

describe('aviso de feriado por parada na montagem (spec 252 T5.3)', () => {
  it('pergunta UMA vez ao terminar, com um par por cidade e dia, e guarda o aviso por parada', async () => {
    const calls: Calls = { items: [] }
    const hook = await runSolver({
      dayChecks: dayChecksClient(calls, () => Promise.resolve([warning])),
      stops: CHRISTMAS_STOPS,
    })

    expect(calls.items).toHaveLength(1)
    expect(calls.items[0]).toEqual([
      { cityIbgeCode: '3509502', date: '2026-12-25' },
      { cityIbgeCode: '4106902', date: '2026-12-25' },
    ])
    const byStop = hook.result().holidayWarnings
    expect([...byStop.keys()]).toEqual([CAMPINAS_KEY, CAMPINAS_OTHER_KEY])
    expect(byStop.get(CAMPINAS_KEY)).toEqual([warning])
  })

  it('o término deixa de avisar o feriado nacional: quem avisa agora é cada parada', async () => {
    const hook = await runSolver({
      dayChecks: dayChecksClient({ items: [] }, () => Promise.resolve([warning])),
      stops: CHRISTMAS_STOPS,
    })

    expect(hook.result().finish?.warnings).toEqual([])
  })

  it('rota caída: sem aviso por parada, e o término volta ao aviso nacional de hoje', async () => {
    const hook = await runSolver({
      dayChecks: dayChecksClient({ items: [] }, () => Promise.reject(new Error('offline'))),
      stops: CHRISTMAS_STOPS,
    })

    expect(hook.result().state).toBe('ocioso')
    expect(hook.result().holidayWarnings.size).toBe(0)
    expect(hook.result().finish?.warnings.map((entry) => entry.kind)).toEqual(['feriado'])
  })

  it('o roteiro não depende do aviso: a ordem do solver é aplicada mesmo com a rota caída', async () => {
    const orders: (readonly string[])[] = []
    const hook = await renderHook(() =>
      useSolverCityOrder({
        client: buildSolverClient(buildSolverSuggestion(CHRISTMAS_STOPS)),
        dayChecksClient: dayChecksClient({ items: [] }, () => Promise.reject(new Error('x'))),
        onOrderChange: (order) => orders.push(order),
        order: CHRISTMAS_STOPS.map((stop) => stop.addressKey),
        points: [
          buildAssemblyPoint({ id: 'n1', stopKey: CAMPINAS_KEY }),
          buildAssemblyPoint({ id: 'n2', stopKey: CURITIBA_KEY }),
        ],
        vehicleId: 'vehicle-1',
      }),
    )

    await requestSolver(hook)

    expect(hook.result().state).toBe('ocioso')
    expect(orders).toHaveLength(1)
  })

  it('solver sem chegada prevista: não há o que perguntar e nenhuma chamada sai', async () => {
    const calls: Calls = { items: [] }
    const hook = await runSolver({
      dayChecks: dayChecksClient(calls, () => Promise.resolve([warning])),
      stops: CHRISTMAS_STOPS.map((stop) => ({ ...stop, estimatedArrivalAt: null })),
    })

    expect(calls.items).toHaveLength(0)
    expect(hook.result().holidayWarnings.size).toBe(0)
  })

  it('mais de 200 pares distintos: não pergunta, e o término mantém o aviso nacional de hoje', async () => {
    const calls: Calls = { items: [] }
    const hook = await runSolver({
      dayChecks: dayChecksClient(calls, () => Promise.resolve([])),
      stops: Array.from({ length: 201 }, (_, index) => ({
        addressKey: `3509502|${String(index).padStart(8, '0')}|1`,
        estimatedArrivalAt:
          index === 200
            ? '2026-12-25T13:00:00.000Z'
            : `2026-${String(1 + (index % 11)).padStart(2, '0')}-${String(1 + Math.floor(index / 11)).padStart(2, '0')}T13:00:00.000Z`,
        sequence: index + 1,
      })),
    })

    expect(calls.items).toHaveLength(0)
    expect(hook.result().finish?.warnings.map((entry) => entry.kind)).toEqual(['feriado'])
  })

  it('solver que falha não pergunta nada', async () => {
    const calls: Calls = { items: [] }
    const hook = await runSolver({
      dayChecks: dayChecksClient(calls, () => Promise.resolve([warning])),
      status: 'failed',
      stops: CHRISTMAS_STOPS,
    })

    expect(hook.result().state).toBe('erro')
    expect(calls.items).toHaveLength(0)
  })

  it('uma nova rodada começa sem os avisos da anterior, mesmo enquanto a rota ainda não respondeu', async () => {
    const calls: Calls = { items: [] }
    let release: (warnings: readonly HolidayWarning[]) => void = () => undefined
    const answers: (() => Promise<readonly HolidayWarning[]>)[] = [
      () => Promise.resolve([warning]),
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    ]
    const hook = await runSolver({
      dayChecks: dayChecksClient(calls, () => answers.shift()?.() ?? Promise.resolve([])),
      stops: CHRISTMAS_STOPS,
    })
    expect(hook.result().holidayWarnings.size).toBe(2)

    let second: Promise<void> = Promise.resolve()
    await act(async () => {
      second = hook.result().request()
      await waitFor(() => expect(calls.items).toHaveLength(2))
    })

    expect(hook.result().holidayWarnings.size).toBe(0)
    await act(async () => {
      release([])
      await second
    })
    expect(hook.result().holidayWarnings.size).toBe(0)
  })
})
