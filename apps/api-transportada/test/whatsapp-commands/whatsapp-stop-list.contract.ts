/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.2 (RF4–RF7b): a lista "Qual parada?" com a fixture das paradas 3–7 do desenho
 * (`specs/300-o-bot-fala-num-padrao-so/conversas.html`, fluxo 2), comparada inteira.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import {
  describeStopListNotUnderstood,
  formatStopList,
  pickStopFromList,
  STOP_LIST_TEXT,
  type StopListTravelView,
} from '../../src/whatsapp-commands/domain/whatsapp-stop-list.policy.js'

function stop(input: {
  readonly city: string
  readonly client: string
  readonly district: string
  readonly latitude: number
  readonly longitude: number
  readonly number: string
  readonly sequence: number
}): WhatsAppStopCandidate {
  return {
    arrivedAt: null,
    city: input.city,
    completedAt: null,
    coordinate: { latitude: input.latitude, longitude: input.longitude },
    district: input.district,
    documents: [
      {
        id: `doc-${input.number}`,
        number: input.number,
        recipientName: input.client,
        separationStatus: 'pending',
      },
    ],
    enRouteSince: null,
    id: `stop-${input.sequence}`,
    sequence: input.sequence,
  }
}

const STOPS = [
  stop({
    city: 'Guaira',
    client: 'RETA ALIMENTOS LTDA',
    district: 'Centro',
    latitude: -20.3186,
    longitude: -48.3108,
    number: '899839',
    sequence: 3,
  }),
  stop({
    city: 'Sao Joaquim da Barra',
    client: 'RETA ALIMENTOS LTDA',
    district: 'Centro',
    latitude: -20.5812,
    longitude: -47.8547,
    number: '899836',
    sequence: 4,
  }),
  stop({
    city: 'Franca',
    client: 'SUPERMERCADO SAO PAULO LTDA',
    district: 'Cidade Nova',
    latitude: -20.528,
    longitude: -47.412,
    number: '899862',
    sequence: 5,
  }),
  stop({
    city: 'Franca',
    client: 'ROSEMARY DA SILVA MINI MERCADO LTDA',
    district: 'Jd. Luiza II',
    latitude: -20.5602,
    longitude: -47.3851,
    number: '899859',
    sequence: 6,
  }),
  stop({
    city: 'Franca',
    client: 'BRANDINELI COMERCIO ATACADISTA DE MERCAD',
    district: 'City Petropolis',
    latitude: -20.5139,
    longitude: -47.389,
    number: '899857',
    sequence: 7,
  }),
]

const TRAVEL: StopListTravelView = {
  byStopId: new Map([
    ['stop-3', { distance: '108 km', duration: '~1 h 25 min' }],
    ['stop-4', { distance: '56 km', duration: '~45 min' }],
    ['stop-5', { distance: '3,2 km', duration: '~8 min' }],
    ['stop-6', { distance: '6,1 km', duration: '~14 min' }],
    ['stop-7', { distance: '4,8 km', duration: '~12 min' }],
  ]),
  isLocationMissing: false,
}

const DESIGN_LIST_WITH_POINT = `🚚 *Para qual parada você saiu?*

> 👉 *PARADA 3 de 9* · _próxima da rota_
> 🧾 NF \`899839\` · *RETA ALIMENTOS LTDA*
> 📍 Centro, Guaira
> 📏 *108 km* · ⏱️ _~1 h 25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108

*PARADA 4 de 9*
🧾 NF \`899836\` · *RETA ALIMENTOS LTDA*
📍 Centro, Sao Joaquim da Barra
📏 *56 km* · ⏱️ _~45 min_
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5812,-47.8547

*PARADA 5 de 9*
🧾 NF \`899862\` · *SUPERMERCADO SAO PAULO LTDA*
📍 Cidade Nova, Franca
📏 *3,2 km* · ⏱️ _~8 min_
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.528,-47.412

*PARADA 6 de 9*
🧾 NF \`899859\` · *ROSEMARY DA SILVA MINI MERCADO LTDA*
📍 Jd. Luiza II, Franca
📏 *6,1 km* · ⏱️ _~14 min_
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5602,-47.3851

*PARADA 7 de 9*
🧾 NF \`899857\` · *BRANDINELI COMERCIO ATACADISTA DE MERCAD*
📍 City Petropolis, Franca
📏 *4,8 km* · ⏱️ _~12 min_
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5139,-47.389

_Responda com o número da parada ou da nota._`

const DESIGN_LIST_WITHOUT_POINT = `🚚 *Para qual parada você saiu?*

> 👉 *PARADA 3 de 9* · _próxima da rota_
> 🧾 NF \`899839\` · *RETA ALIMENTOS LTDA*
> 📍 Centro, Guaira
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108

*PARADA 4 de 9*
🧾 NF \`899836\` · *RETA ALIMENTOS LTDA*
📍 Centro, Sao Joaquim da Barra
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5812,-47.8547

*PARADA 5 de 9*
🧾 NF \`899862\` · *SUPERMERCADO SAO PAULO LTDA*
📍 Cidade Nova, Franca
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.528,-47.412

*PARADA 6 de 9*
🧾 NF \`899859\` · *ROSEMARY DA SILVA MINI MERCADO LTDA*
📍 Jd. Luiza II, Franca
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5602,-47.3851

*PARADA 7 de 9*
🧾 NF \`899857\` · *BRANDINELI COMERCIO ATACADISTA DE MERCAD*
📍 City Petropolis, Franca
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5139,-47.389

_Responda com o número da parada ou da nota._
📎 _Mande sua localização pelo clipe para ver distância e tempo._`

describe('formatStopList (RF4–RF7b, paradas 3–7 do desenho)', () => {
  test('com ponto: igual ao desenho, com distância e tempo', () => {
    expect(
      formatStopList({
        stops: STOPS,
        title: STOP_LIST_TEXT.departTitle,
        totalStops: 9,
        travel: TRAVEL,
      }),
    ).toBe(DESIGN_LIST_WITH_POINT)
  })

  test('sem ponto: a linha some e a lista termina com o 📎', () => {
    expect(
      formatStopList({
        stops: STOPS,
        title: STOP_LIST_TEXT.departTitle,
        totalStops: 9,
        travel: { byStopId: new Map(), isLocationMissing: true },
      }),
    ).toBe(DESIGN_LIST_WITHOUT_POINT)
  })

  test('OSRM fora: a linha some em todas e não há rodapé de localização', () => {
    const text = formatStopList({
      stops: STOPS,
      title: STOP_LIST_TEXT.departTitle,
      totalStops: 9,
      travel: { byStopId: new Map(), isLocationMissing: false },
    })
    expect(text).toBe(DESIGN_LIST_WITHOUT_POINT.replace(/\n📎 .*$/u, ''))
  })

  test('parada sem estrada ou sem coordenada perde só a sua linha', () => {
    const [first, ...rest] = STOPS
    const bare = { ...first, coordinate: undefined } as WhatsAppStopCandidate
    const text = formatStopList({
      stops: [bare, ...rest],
      title: STOP_LIST_TEXT.departTitle,
      totalStops: 9,
      travel: {
        byStopId: new Map([['stop-4', { distance: '56 km', duration: '~45 min' }]]),
        isLocationMissing: false,
      },
    })
    expect(text).toContain(
      '> 📍 Centro, Guaira\n\n*PARADA 4 de 9*\n🧾 NF `899836` · *RETA ALIMENTOS LTDA*\n📍 Centro, Sao Joaquim da Barra\n📏 *56 km* · ⏱️ _~45 min_',
    )
  })

  test('mais de 10 paradas: as 10 primeiras e o rodapé "E mais K paradas"', () => {
    const many = Array.from({ length: 13 }, (_, index) =>
      stop({
        city: 'Franca',
        client: `CLIENTE ${index + 1}`,
        district: 'Centro',
        latitude: -20.5,
        longitude: -47.4,
        number: String(1000 + index),
        sequence: index + 1,
      }),
    )
    const text = formatStopList({
      stops: many,
      title: STOP_LIST_TEXT.departTitle,
      totalStops: 13,
    })
    expect(text.split('\n\n').length).toBe(1 + 10 + 1)
    expect(
      text.endsWith(
        '\n\n_E mais 3 paradas (11 a 13): responda com o número da parada ou da nota._',
      ),
    ).toBe(true)
    expect(text).not.toContain('*PARADA 11 de 13*')
  })
})

describe('pickStopFromList (RF5)', () => {
  const options = STOPS.map((item) => ({
    id: item.id,
    numbers: item.documents.map((document) => document.number),
    sequence: item.sequence,
  }))

  test('o número da parada escolhe a parada, não a posição na lista', () => {
    expect(pickStopFromList(options, '5')).toMatchObject({
      kind: 'picked',
      option: { id: 'stop-5' },
    })
    expect(pickStopFromList(options, 'parada 7')).toMatchObject({
      kind: 'picked',
      option: { id: 'stop-7' },
    })
  })

  test('o número da nota continua valendo, com ou sem zeros à esquerda', () => {
    expect(pickStopFromList(options, '899862')).toMatchObject({
      kind: 'picked',
      option: { id: 'stop-5' },
    })
    expect(pickStopFromList(options, 'NF 0899862')).toMatchObject({
      kind: 'picked',
      option: { id: 'stop-5' },
    })
  })

  test('parada que não está na lista: o motivo do desenho', () => {
    expect(pickStopFromList(options, '12')).toEqual({
      kind: 'not_found',
      reason: 'Não achei a parada 12 nesta viagem.',
    })
    expect(pickStopFromList(options, '1')).toEqual({
      kind: 'not_found',
      reason: 'Não achei a parada 1 nesta viagem.',
    })
  })

  test('nota que não está na lista e texto sem número têm motivo próprio', () => {
    expect(pickStopFromList(options, '123456')).toEqual({
      kind: 'not_found',
      reason: 'Não achei a nota 123456 nesta viagem.',
    })
    expect(pickStopFromList(options, 'ok')).toEqual({
      kind: 'not_found',
      reason: 'Não achei essa parada na lista.',
    })
  })

  test('pedido aberto antes da spec (sem sequência): o número volta a ser a posição', () => {
    const legacy = options.map(({ id, numbers }) => ({ id, numbers }))
    expect(pickStopFromList(legacy, '2')).toMatchObject({
      kind: 'picked',
      option: { id: 'stop-4' },
    })
  })

  test('o "não entendi" é o do desenho, com o intervalo das paradas', () => {
    expect(describeStopListNotUnderstood(options, 'Não achei a parada 12 nesta viagem.')).toBe(
      '🤔 *Não entendi.* Não achei a parada 12 nesta viagem.\n_Responda com o número da parada (3 a 7) ou da nota._',
    )
  })
})
