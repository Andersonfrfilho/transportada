/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  computeClockOffsetMs,
  createClockOffsetStore,
} from '../../src/modules/driver-trip/shared/clockOffset.service'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'

const DEVICE_NOW_MS = Date.parse('2026-10-03T12:00:00.000Z')

/**
 * Spec 234 D1: `desvio = hora do servidor (cabeçalho Date) − hora do aparelho`. Aparelho atrasado
 * dá desvio positivo, adiantado dá negativo — é o sinal que `resolveOccurredAt` da API soma em
 * `tappedAt` para chegar à hora do servidor.
 */
describe('computeClockOffsetMs (spec 234 D1)', () => {
  it('aparelho atrasado: o servidor está à frente, desvio positivo', () => {
    const offset = computeClockOffsetMs({
      deviceNowMs: DEVICE_NOW_MS,
      serverDateHeader: 'Sat, 03 Oct 2026 12:00:10 GMT',
    })

    expect(offset).toBe(10_000)
  })

  it('aparelho adiantado: o servidor está atrás, desvio negativo', () => {
    const offset = computeClockOffsetMs({
      deviceNowMs: Date.parse('2026-10-03T12:05:00.000Z'),
      serverDateHeader: 'Sat, 03 Oct 2026 12:00:00 GMT',
    })

    expect(offset).toBe(-300_000)
  })

  it('relógios iguais dão zero — e zero é um desvio medido, não ausência', () => {
    const offset = computeClockOffsetMs({
      deviceNowMs: DEVICE_NOW_MS,
      serverDateHeader: 'Sat, 03 Oct 2026 12:00:00 GMT',
    })

    expect(offset).toBe(0)
  })

  it('devolve inteiro: a API recusa desvio fracionário', () => {
    const offset = computeClockOffsetMs({
      deviceNowMs: DEVICE_NOW_MS + 0.5,
      serverDateHeader: 'Sat, 03 Oct 2026 12:00:10 GMT',
    })

    expect(Number.isInteger(offset)).toBe(true)
  })

  it('cabeçalho ausente ou ilegível não mede nada', () => {
    expect(computeClockOffsetMs({ deviceNowMs: DEVICE_NOW_MS, serverDateHeader: null })).toBe(
      undefined,
    )
    expect(computeClockOffsetMs({ deviceNowMs: DEVICE_NOW_MS, serverDateHeader: '' })).toBe(
      undefined,
    )
    expect(
      computeClockOffsetMs({ deviceNowMs: DEVICE_NOW_MS, serverDateHeader: 'ontem de manhã' }),
    ).toBe(undefined)
  })
})

describe('o armazenamento do desvio (spec 234 D1)', () => {
  it('nasce sem desvio, e guarda o último medido', () => {
    const store = createClockOffsetStore()
    expect(store.read()).toBe(undefined)

    store.write(1_500)
    store.write(-40)

    expect(store.read()).toBe(-40)
  })

  it('cada armazenamento é independente — nada vaza de um para outro', () => {
    const first = createClockOffsetStore()
    const second = createClockOffsetStore()

    first.write(900)

    expect(second.read()).toBe(undefined)
  })
})

function buildMeasuringClient(input: {
  readonly deviceTimes: readonly number[]
  readonly respond: () => Response | Promise<Response>
  readonly store: ReturnType<typeof createClockOffsetStore>
}) {
  const times = [...input.deviceTimes]
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    clockOffset: input.store,
    fetch: () => Promise.resolve(input.respond()),
    getAccessToken: () => Promise.resolve('token'),
    now: () => times.shift() ?? DEVICE_NOW_MS,
  })
}

function okResponse(dateHeader: string | undefined): Response {
  return new Response('{"data":{"acceptedAt":null}}', {
    headers: {
      'content-type': 'application/json',
      ...(dateHeader === undefined ? {} : { date: dateHeader }),
    },
  })
}

/**
 * O pedido leva 2 s ida e volta: o servidor carimbou a resposta perto do meio dele, então o aparelho
 * compara o `Date` com o ponto médio. Aqui o servidor diz 12:00:11 e o meio do pedido foi 12:00:01.
 */
describe('o cliente mede o desvio na resposta da API (spec 234 D1)', () => {
  it('lê o cabeçalho Date de uma resposta bem-sucedida e compara com o ponto médio do pedido', async () => {
    const store = createClockOffsetStore()
    const client = buildMeasuringClient({
      deviceTimes: [DEVICE_NOW_MS, DEVICE_NOW_MS + 2_000],
      respond: () => okResponse('Sat, 03 Oct 2026 12:00:11 GMT'),
      store,
    })

    await client.readLocationConsent()

    expect(store.read()).toBe(10_000)
  })

  it('guarda o mais recente: uma resposta nova substitui a anterior', async () => {
    const store = createClockOffsetStore()
    store.write(777)
    const client = buildMeasuringClient({
      deviceTimes: [DEVICE_NOW_MS, DEVICE_NOW_MS],
      respond: () => okResponse('Sat, 03 Oct 2026 11:59:00 GMT'),
      store,
    })

    await client.readLocationConsent()

    expect(store.read()).toBe(-60_000)
  })

  it('resposta recusada pelo servidor não mede: erro não é referência de hora', async () => {
    const store = createClockOffsetStore()
    store.write(777)
    const client = buildMeasuringClient({
      deviceTimes: [DEVICE_NOW_MS, DEVICE_NOW_MS],
      respond: () =>
        new Response('{"error":{"code":"INTERNAL"}}', {
          headers: { date: 'Sat, 03 Oct 2026 12:30:00 GMT' },
          status: 500,
        }),
      store,
    })

    await client.readLocationConsent().catch(() => undefined)

    expect(store.read()).toBe(777)
  })

  it('resposta sem Date não apaga o desvio que já existia', async () => {
    const store = createClockOffsetStore()
    store.write(777)
    const client = buildMeasuringClient({
      deviceTimes: [DEVICE_NOW_MS, DEVICE_NOW_MS],
      respond: () => okResponse(undefined),
      store,
    })

    await client.readLocationConsent()

    expect(store.read()).toBe(777)
  })

  it('rede que não respondeu não mede', async () => {
    const store = createClockOffsetStore()
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      clockOffset: store,
      fetch: () => Promise.reject(new Error('sem sinal')),
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.readLocationConsent().catch(() => undefined)

    expect(store.read()).toBe(undefined)
  })

  it('o comprovante também mede: é a mesma porta de saída do cliente', async () => {
    const store = createClockOffsetStore()
    const client = buildMeasuringClient({
      deviceTimes: [DEVICE_NOW_MS, DEVICE_NOW_MS + 4_000],
      respond: () =>
        new Response('{"data":{"id":"proof-1","punctuality":"on_time"}}', {
          headers: { date: 'Sat, 03 Oct 2026 12:00:05 GMT' },
        }),
      store,
    })

    await client.attachProof({
      documentId: 'document-1',
      file: new File([new Uint8Array([1])], 'canhoto.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })

    expect(store.read()).toBe(3_000)
  })
})
