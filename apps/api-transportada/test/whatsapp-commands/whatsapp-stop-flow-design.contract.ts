/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.3–T3.5 (critério 1): as mensagens dos fluxos 2 (Saí), 3 (Cheguei) e 4 (Próxima parada) de
 * `specs/300-o-bot-fala-num-padrao-so/conversas.html`, com a fixture das paradas 3 e 7 do desenho, comparadas inteiras.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { ADDRESS_CORRECTION_TEXT } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { interpolateBotSpeech } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.policy.js'
import {
  arrivedStopActions,
  describeAlreadyArrived,
  describeAlreadyDeparted,
  describeArrivalReply,
  describeDepartureReply,
  describeJourneyNotUnderstood,
  describePendingSettlement,
  JOURNEY_TEXT,
  nextRouteActions,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import {
  describeOutOfOrderNotUnderstood,
  describeOutOfOrderViolation,
  OUT_OF_ORDER_TEXT,
  toOrderStopLabel,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import {
  describeLocationPrompt,
  LOCATION_PROMPT_TEXT,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import type { StopCard } from '../../src/whatsapp-commands/domain/whatsapp-stop-card.policy.js'

const STOP_3: StopCard = {
  address: 'R. 18, 1240 – Centro, Guaira/SP',
  city: 'Guaira',
  contractorName: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
  coordinate: { latitude: '-20.3186', longitude: '-48.3108' },
  district: 'Centro',
  documentNumbers: ['899839'],
  isAddressReliable: true,
  recipientName: 'RETA ALIMENTOS LTDA',
  sequence: 3,
  stopId: 'stop-3',
  totalStops: 9,
  totalValue: '4812.30',
  volumes: 12,
}

const ETA_STOP_3 = { distanceMetres: 108_000, durationSeconds: 5100 }

/** 21:58 em Brasília: a chegada prevista de 1 h 25 min é 23:23. */
const DEPARTED_AT = new Date('2026-11-07T00:58:00.000Z')

const STOP_3_LIST_BLOCK = [
  '> *PARADA 3 de 9*',
  '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
  '> 📍 Centro, Guaira',
].join('\n')

const STOP_3_MAP =
  '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108'

function candidate(input: {
  readonly city: string
  readonly client: string
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
    district: input.city === 'Guaira' ? 'Centro' : 'City Petropolis',
    documents: [{ number: input.number, recipientName: input.client, separationStatus: 'pending' }],
    enRouteSince: null,
    id: `stop-${input.sequence}`,
    sequence: input.sequence,
  }
}

describe('fluxo 2 · Saí', () => {
  test('pedido de localização e o "não entendi" dele', () => {
    expect(LOCATION_PROMPT_TEXT.ask).toBe(
      [
        '📍 *Mande sua localização* para medir a distância até a parada.',
        'Clipe 📎 → Localização → Enviar localização atual.',
        '_Se não puder agora, responda pular._',
      ].join('\n'),
    )
    expect(LOCATION_PROMPT_TEXT.askAgain).toBe(
      [
        '🤔 *Não entendi.* Esta resposta vai por localização.',
        'Clipe 📎 → Localização → Enviar localização atual, _ou responda pular._',
      ].join('\n'),
    )
  })

  test('saída registrada: a fala com a hora, o bloco completo em citação, valor e chegada prevista', () => {
    const headline = interpolateBotSpeech(BOT_SPEECH_DEFAULTS.departureRegistered, {
      time: '21:58',
    })
    expect(describeDepartureReply(headline, { card: STOP_3, eta: ETA_STOP_3 }, DEPARTED_AT)).toBe(
      [
        '🚚 *Saída registrada* · 21:58',
        '',
        '> *PARADA 3 de 9*',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 🏢 Contratante: COMERCIAL ZARAGOZA IMP EXP LTDA',
        '> 📍 R. 18, 1240 – Centro, Guaira/SP',
        '> 📦 12 volumes',
        '> 📏 *108 km* · ⏱️ _~1 h 25 min_',
        STOP_3_MAP,
        '> 💰 Valor da nota: *R$ 4.812,30*',
        '> ⏱️ Chegada prevista: *~23:23*',
        '',
        '➡️ _Próximo passo:_ quando chegar, mande *cheguei*.',
      ].join('\n'),
    )
  })

  test('já está a caminho (RF9): a fala, o bloco com a estrada e o menu Cheguei / ocorrência / nada', () => {
    const headline = interpolateBotSpeech(BOT_SPEECH_DEFAULTS.stopEnRoute, { sequence: '3' })
    expect(describeAlreadyDeparted({ card: STOP_3, eta: ETA_STOP_3 }, headline)).toBe(
      [
        '⚠️ *Você já está a caminho da parada 3.*',
        'Registre a chegada nela antes de sair para outra.',
        '',
        STOP_3_LIST_BLOCK,
        '> 📏 *108 km* · ⏱️ _~1 h 25 min_',
        STOP_3_MAP,
        '',
        '*O que você quer fazer agora?*',
        '*1* - 📍 Cheguei na *parada 3*',
        '*2* - ⚠️ Abrir ocorrência',
        '*3* - 💤 Nada por enquanto',
      ].join('\n'),
    )
  })

  test('saí com a baixa pendente', () => {
    expect(
      describePendingSettlement(
        { card: STOP_3 },
        { arrivedAt: '2026-11-07T02:20:00.000Z', now: DEPARTED_AT },
      ),
    ).toBe(
      [
        '⚠️ *Falta a baixa da parada 3.*',
        'Você chegou às 23:20 e ainda não registrou a entrega.',
        '',
        STOP_3_LIST_BLOCK,
        STOP_3_MAP,
        '',
        '*O que você quer fazer agora?*',
        '*1* - ✅ Entreguei _(mande a foto do canhoto)_',
        '*2* - ↩️ Não entreguei',
        '*3* - 🚚 Sair para outra parada sem dar a baixa',
        '*4* - 💤 Nada por enquanto',
      ].join('\n'),
    )
  })

  describe('saída fora da rota', () => {
    const stops = [
      candidate({
        city: 'Guaira',
        client: 'RETA ALIMENTOS LTDA',
        latitude: -20.3186,
        longitude: -48.3108,
        number: '899839',
        sequence: 3,
      }),
      candidate({
        city: 'Franca',
        client: 'BRANDINELI COMERCIO ATACADISTA DE MERCAD',
        latitude: -20.5139,
        longitude: -47.389,
        number: '899857',
        sequence: 7,
      }),
    ]
    const travel = {
      byStopId: new Map([
        ['stop-3', { distance: '108 km', duration: '~1 h 25 min' }],
        ['stop-7', { distance: '4,8 km', duration: '~12 min' }],
      ]),
      isLocationMissing: false,
    }
    const labels = new Map(
      stops.map((stop) => [stop.id, toOrderStopLabel(stop, { total: 9, travel })] as const),
    )

    test('os dois blocos em citação lado a lado e as opções por extenso', () => {
      expect(
        describeOutOfOrderViolation({
          event: 'depart',
          labels,
          violation: {
            currentSequence: null,
            currentStopId: null,
            nextSequence: 3,
            nextStopId: 'stop-3',
            requestedSequence: 7,
            requestedStopId: 'stop-7',
          },
        }),
      ).toBe(
        [
          '⚠️ *Fora da rota sugerida*',
          'A rota sugere ir antes para a *parada 3*. Se achar melhor, pode seguir para a 7.',
          '',
          '> 🚚 *VOCÊ ESCOLHEU · PARADA 7*',
          '> 🧾 NF `899857` · *BRANDINELI COMERCIO ATACADISTA DE MERCAD*',
          '> 📍 City Petropolis, Franca',
          '> 📏 *4,8 km* · ⏱️ _~12 min_',
          '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5139,-47.389',
          '',
          '> 👉 *PRÓXIMA DA ROTA · PARADA 3*',
          '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
          '> 📍 Centro, Guaira',
          '> 📏 *108 km* · ⏱️ _~1 h 25 min_',
          STOP_3_MAP,
          '',
          '*Para onde você vai?*',
          '*1* - ✅ Seguir para a *parada 7*',
          '*2* - 👉 Ir para a *parada 3*',
          '',
          '_Responda 1 ou 2._',
        ].join('\n'),
      )
    })

    test('"não entendi" com as opções por extenso; descartar é o desfecho padrão', () => {
      expect(describeOutOfOrderNotUnderstood({ event: 'depart', other: 3, requested: 7 })).toBe(
        '🤔 *Não entendi.* Responda *1* para seguir para a *parada 7* ou *2* para ir para a *parada 3*.',
      )
      expect(OUT_OF_ORDER_TEXT.discarded).toBe('↩️ *Descartado.* Nada foi registrado.')
    })
  })
})

const STOP_4: StopCard = {
  ...STOP_3,
  city: 'Sao Joaquim da Barra',
  district: 'Centro',
  documentNumbers: ['899836'],
  sequence: 4,
  stopId: 'stop-4',
}

describe('fluxo 3 · Cheguei', () => {
  test('chegada registrada com o endereço corrigido: a fala com a hora, o bloco, a prévia da próxima e o próximo passo', () => {
    const headline = [
      interpolateBotSpeech(BOT_SPEECH_DEFAULTS.arrivalRegistered, { time: '23:20' }),
      ADDRESS_CORRECTION_TEXT.applied,
    ].join('\n')
    expect(describeArrivalReply(headline, { card: STOP_3, next: STOP_4 })).toBe(
      [
        '📍 *Chegada registrada* · 23:20',
        '✅ _Endereço corrigido pela sua localização._',
        '',
        '> *PARADA 3 de 9*',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 🏢 Contratante: COMERCIAL ZARAGOZA IMP EXP LTDA',
        '> 📍 R. 18, 1240 – Centro, Guaira/SP',
        '> 📦 12 volumes',
        STOP_3_MAP,
        '> 💰 Valor da nota: *R$ 4.812,30*',
        '',
        '🔜 *Depois desta:* parada 4 · RETA ALIMENTOS LTDA – Sao Joaquim da Barra',
        '',
        '➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.',
      ].join('\n'),
    )
  })

  test('endereço sem localização certa', () => {
    expect(describeLocationPrompt({ event: 'arrive', isAddressReliable: false })).toBe(
      [
        '📍 *Este endereço está sem localização certa no mapa.*',
        'Mande sua localização que eu corrijo o endereço.',
        'Clipe 📎 → Localização → Enviar localização atual.',
        '_Se não puder agora, responda pular._',
      ].join('\n'),
    )
  })

  test('cheguei repetido: o bloco e o menu; "nada por enquanto" fecha com o próximo passo', () => {
    expect(
      describeAlreadyArrived(
        { card: STOP_3 },
        { arrivedAt: '2026-11-07T02:20:00.000Z', now: DEPARTED_AT },
      ),
    ).toBe(
      [
        '⚠️ *A chegada na parada 3 já foi registrada* às 23:20.',
        '',
        STOP_3_LIST_BLOCK,
        STOP_3_MAP,
        '',
        '*O que você quer fazer agora?*',
        '*1* - ✅ Entreguei _(mande a foto do canhoto)_',
        '*2* - ↩️ Não entreguei',
        '*3* - ⚠️ Abrir ocorrência',
        '*4* - 💤 Nada por enquanto',
      ].join('\n'),
    )
    expect(`${JOURNEY_TEXT.nothingRecorded}\n${JOURNEY_TEXT.nextSettle}`).toBe(
      '👍 *Certo, nada foi registrado.*\n➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.',
    )
  })

  test('chegada fora da rota', () => {
    const labels = new Map([
      [
        'stop-7',
        toOrderStopLabel(
          candidate({
            city: 'Franca',
            client: 'BRANDINELI COMERCIO ATACADISTA DE MERCAD',
            latitude: -20.5139,
            longitude: -47.389,
            number: '899857',
            sequence: 7,
          }),
          { total: 9 },
        ),
      ],
    ])
    expect(
      describeOutOfOrderViolation({
        event: 'arrive',
        labels,
        violation: {
          currentSequence: 3,
          currentStopId: 'stop-3',
          nextSequence: 3,
          nextStopId: 'stop-3',
          requestedSequence: 7,
          requestedStopId: 'stop-7',
        },
      }),
    ).toBe(
      [
        '⚠️ *Fora da rota sugerida*',
        'Você está a caminho da *parada 3*, e este "cheguei" é da *parada 7*. Se achar melhor, pode registrar.',
        '',
        '> 📍 *CHEGADA · PARADA 7*',
        '> 🧾 NF `899857` · *BRANDINELI COMERCIO ATACADISTA DE MERCAD*',
        '> 📍 City Petropolis, Franca',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5139,-47.389',
        '',
        '*1* - ✅ Cheguei na *parada 7*',
        '*2* - ↩️ Foi engano, descartar',
        '',
        '_A parada 3 continua aberta. Responda 1 ou 2._',
      ].join('\n'),
    )
  })
})

describe('o "não entendi" dos menus', () => {
  test('o motivo termina em dois-pontos e as opções vêm em seguida', () => {
    expect(describeJourneyNotUnderstood(nextRouteActions(STOP_3))).toBe(
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - 🚚 Seguir para a *parada 3*',
        '*2* - 📋 Escolher outra da lista',
        '*3* - 💤 Nada por enquanto',
      ].join('\n'),
    )
    expect(arrivedStopActions(STOP_3)).toHaveLength(4)
  })
})
