/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TripStopOrderNotice } from '../../src/modules/trip/components/TripStopOrderNotice.component'
import {
  isCityOrderTouched,
  resolveStopKey,
} from '../../src/modules/trip/shared/assemblyOrder.service'
import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'

import { SYNTHETIC_ACCESS_TOKEN, TRIP_DETAIL, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'

const NOTE = {
  recipientAddressNumber: '10',
  recipientCityCode: '3529401',
  recipientPostalCode: '15990000',
}
const OTHER = {
  recipientAddressNumber: '10',
  recipientCityCode: '3524303',
  recipientPostalCode: '14870000',
}

function clientAnswering(input: { readonly data: unknown; readonly requests?: Request[] }) {
  return createTripClient({
    apiUrl: API_URL,
    fetch: (resource, init) => {
      input.requests?.push(new Request(resource, init))
      return Promise.resolve(Response.json({ data: input.data }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('a origem da ordem das paradas (spec 323)', () => {
  test('o detalhe aceita a origem e o código da falha, e continua aceitando a API que ainda não os serve', async () => {
    const withSource = await clientAnswering({
      data: {
        ...TRIP_DETAIL,
        stopOrderErrorCode: 'ROUTING_MATRIX_UNAVAILABLE',
        stopOrderSource: 'unordered',
      },
    }).getTrip({ tripId: TRIP_ID })
    expect(withSource.stopOrderSource).toBe('unordered')
    expect(withSource.stopOrderErrorCode).toBe('ROUTING_MATRIX_UNAVAILABLE')

    const without = await clientAnswering({
      data: Object.fromEntries(
        Object.entries(TRIP_DETAIL).filter(([key]) => !key.startsWith('stopOrder')),
      ),
    }).getTrip({ tripId: TRIP_ID })
    expect(without.stopOrderSource).toBeUndefined()
  })

  test('valor fora do vocabulário não derruba o detalhe: o campo é descartado', async () => {
    const detail = await clientAnswering({
      data: { ...TRIP_DETAIL, stopOrderSource: 'inventada' },
    }).getTrip({ tripId: TRIP_ID })

    expect(detail.id).toBe(TRIP_DETAIL.id)
    expect(detail.stopOrderSource).toBeUndefined()
  })

  test('"Ordenar paradas" é um POST sem corpo em /stops/auto-order e lê o desfecho', async () => {
    const requests: Request[] = []
    const result = await clientAnswering({
      data: { errorCode: null, excludedStopCount: 1, status: 'ordered' },
      requests,
    }).autoOrderTripStops({ tripId: TRIP_ID })

    expect(result).toEqual({ errorCode: null, excludedStopCount: 1, status: 'ordered' })
    expect(`${requests[0]?.method} ${requests[0]?.url.replace(API_URL, '')}`).toBe(
      `POST /trips/${TRIP_ID}/stops/auto-order`,
    )
    expect(await (requests[0] as Request).text()).toBe('')
  })

  test('resposta do botão fora do contrato é recusada', async () => {
    const outcome = await clientAnswering({
      data: { errorCode: 'OUTRO', excludedStopCount: 0, status: 'ordered' },
    })
      .autoOrderTripStops({ tripId: TRIP_ID })
      .then(
        () => 'aceita',
        () => 'recusada',
      )

    expect(outcome).toBe('recusada')
  })

  test('o mapa só vira ordem manual quando o operador mexeu nas cidades', () => {
    const documents = [NOTE, OTHER]
    const arrival = documents.map((document) =>
      resolveStopKey({
        cityCode: document.recipientCityCode,
        number: document.recipientAddressNumber,
        postalCode: document.recipientPostalCode,
      }),
    )
    expect(isCityOrderTouched({ cityOrder: arrival, documents })).toBe(false)
    expect(isCityOrderTouched({ cityOrder: [...arrival].reverse(), documents })).toBe(true)
    expect(isCityOrderTouched({ cityOrder: [], documents: [] })).toBe(false)
  })

  function render(props: Partial<Parameters<typeof TripStopOrderNotice>[0]>): string {
    return renderToStaticMarkup(
      createElement(TripStopOrderNotice, {
        canOrder: true,
        errorCode: null,
        isOrdering: false,
        onOrder: () => {},
        source: 'suggested',
        stopCount: 3,
        ...props,
      }),
    )
  }

  test('a nota mostra a origem e o botão do design system; uma parada só não desenha nada', () => {
    expect(render({})).toContain('Ordem sugerida pela rota por estrada')
    expect(render({})).toContain('Ordenar paradas')
    expect(render({ source: undefined })).toContain('Paradas na ordem em que as notas entraram.')
    expect(render({ stopCount: 1 })).toBe('')
  })

  test('a falha diz o motivo, em vez da origem, e não esconde o botão', () => {
    const html = render({ errorCode: 'ROUTING_MATRIX_UNAVAILABLE', source: 'unordered' })
    expect(html).toContain('o serviço de rotas não respondeu')
    expect(html).not.toContain('Ordem sugerida')
    expect(html).toContain('Ordenar paradas')
  })

  test('sem permissão ou com a viagem travada, o botão some', () => {
    expect(render({ canOrder: false })).not.toContain('Ordenar paradas')
  })
})
