/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

/**
 * ADR 0098 §8: a Nota RP aceita 1 req/s (burst 3). O limitador envolve o `fetch` do composition root e
 * é **uma instância por processo**, compartilhada pelos gateways de emissão e de status — um
 * limitador dentro do cliente não limitaria nada, porque o cliente nasce e morre a cada chamada.
 * Relógio e espera são injetados: nenhum teste aqui espera de verdade.
 */

type FetchStub = (input: string, init: RequestInit) => Promise<Response>

type RateLimitModule = {
  createRateLimitedFetch(
    fetchImplementation: FetchStub,
    options: {
      clock: () => number
      minIntervalMilliseconds: number
      sleep: (milliseconds: number) => Promise<void>
    },
  ): FetchStub
}

const MIN_INTERVAL = 1000

type FakeTime = {
  advance(milliseconds: number): void
  clock: () => number
  sleep: (milliseconds: number) => Promise<void>
  sleeps: number[]
}

function createFakeTime(): FakeTime {
  let now = 0
  const sleeps: number[] = []
  return {
    advance: (milliseconds) => {
      now += milliseconds
    },
    clock: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      now += milliseconds
    },
    sleeps,
  }
}

function recordingFetchAt(input: { failOn?: string; time: FakeTime }): {
  calls: { at: number; url: string }[]
  fetch: FetchStub
} {
  const calls: { at: number; url: string }[] = []
  return {
    calls,
    fetch: async (url) => {
      calls.push({ at: input.time.clock(), url })
      if (url === input.failOn) throw new TypeError('fetch failed')
      return new Response('{}', { status: 200 })
    },
  }
}

async function createLimited(input: { fetch: FetchStub; time: FakeTime }): Promise<FetchStub> {
  const module = (await import(
    '../../src/nfse-issuance/infrastructure/nota-rp-rate-limit.js'
  )) as RateLimitModule
  return module.createRateLimitedFetch(input.fetch, {
    clock: input.time.clock,
    minIntervalMilliseconds: MIN_INTERVAL,
    sleep: input.time.sleep,
  })
}

function gaps(calls: readonly { at: number }[]): number[] {
  return calls.slice(1).map((call, index) => call.at - (calls[index]?.at ?? 0))
}

describe('Limitador de taxa da Nota RP', () => {
  test('chamadas concorrentes saem espaçadas de pelo menos o intervalo, na ordem de chegada', async () => {
    const time = createFakeTime()
    const { calls, fetch } = recordingFetchAt({ time })
    const limited = await createLimited({ fetch, time })

    await Promise.all(['/a', '/b', '/c'].map((url) => limited(url, { method: 'GET' })))

    expect(calls.map((call) => call.url)).toEqual(['/a', '/b', '/c'])
    for (const gap of gaps(calls)) expect(gap).toBeGreaterThanOrEqual(MIN_INTERVAL)
  })

  // Os dois gateways seguram a mesma função: a emissão não pode furar a fila do status pull.
  test('dois consumidores da mesma instância respeitam o mesmo relógio', async () => {
    const time = createFakeTime()
    const { calls, fetch } = recordingFetchAt({ time })
    const limited = await createLimited({ fetch, time })
    const issuanceGateway = { fetch: limited }
    const statusPullGateway = { fetch: limited }

    await Promise.all([
      issuanceGateway.fetch('/emitir', { method: 'POST' }),
      statusPullGateway.fetch('/listar', { method: 'GET' }),
      issuanceGateway.fetch('/emitir-2', { method: 'POST' }),
    ])

    expect(calls.map((call) => call.url)).toEqual(['/emitir', '/listar', '/emitir-2'])
    for (const gap of gaps(calls)) expect(gap).toBeGreaterThanOrEqual(MIN_INTERVAL)
  })

  test('com o intervalo já vencido a chamada sai sem esperar', async () => {
    const time = createFakeTime()
    const { calls, fetch } = recordingFetchAt({ time })
    const limited = await createLimited({ fetch, time })

    await limited('/a', { method: 'GET' })
    time.advance(5000)
    await limited('/b', { method: 'GET' })

    expect(calls.map((call) => call.at)).toEqual([0, 5000])
    expect(time.sleeps.filter((milliseconds) => milliseconds > 0)).toEqual([])
  })

  test('espera só o que falta do intervalo', async () => {
    const time = createFakeTime()
    const { calls, fetch } = recordingFetchAt({ time })
    const limited = await createLimited({ fetch, time })

    await limited('/a', { method: 'GET' })
    time.advance(400)
    await limited('/b', { method: 'GET' })

    expect(calls.map((call) => call.at)).toEqual([0, MIN_INTERVAL])
    expect(time.sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBe(600)
  })

  test('um erro da chamada propaga e não trava a fila', async () => {
    const time = createFakeTime()
    const { calls, fetch } = recordingFetchAt({ failOn: '/a', time })
    const limited = await createLimited({ fetch, time })

    const [first, second] = await Promise.allSettled([
      limited('/a', { method: 'GET' }),
      limited('/b', { method: 'GET' }),
    ])

    expect(first.status).toBe('rejected')
    expect(second.status).toBe('fulfilled')
    expect(calls.map((call) => call.url)).toEqual(['/a', '/b'])
    for (const gap of gaps(calls)) expect(gap).toBeGreaterThanOrEqual(MIN_INTERVAL)
  })

  test('repassa url e init e devolve a resposta sem alterar', async () => {
    const time = createFakeTime()
    const response = new Response('{"success":true}', { status: 201 })
    const received: { init: RequestInit; url: string }[] = []
    const limited = await createLimited({
      fetch: async (url, init) => {
        received.push({ init, url })
        return response
      },
      time,
    })
    const init: RequestInit = { body: '{}', method: 'POST' }

    const returned = await limited('https://nota-rp.invalid/api/v3/nota/emitir', init)

    expect(returned).toBe(response)
    expect(received).toEqual([{ init, url: 'https://nota-rp.invalid/api/v3/nota/emitir' }])
  })

  test('com relógio falso nada espera de verdade', async () => {
    const time = createFakeTime()
    const { fetch } = recordingFetchAt({ time })
    const limited = await createLimited({ fetch, time })
    const startedAt = Date.now()

    await Promise.all(
      Array.from({ length: 5 }, (_, index) => limited(`/n${index}`, { method: 'GET' })),
    )

    expect(Date.now() - startedAt).toBeLessThan(MIN_INTERVAL)
  })
})
