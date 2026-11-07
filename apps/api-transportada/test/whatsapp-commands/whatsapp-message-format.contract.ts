/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T1.1 (RF1–RF3c, RF7b): o formato único das mensagens do bot. Os textos esperados são os de
 * `specs/300-o-bot-fala-num-padrao-so/conversas.html`, comparados inteiros.
 */
import { describe, expect, test } from 'bun:test'

import {
  formatDirectionsUrl,
  formatNextStep,
  formatNotUnderstood,
  formatOptions,
  formatReplyHint,
  formatSpokenChoices,
  formatStopBlock,
  type MessageStop,
} from '../../src/whatsapp-commands/domain/whatsapp-message-format.policy.js'

const STOP_THREE: MessageStop = {
  sequence: 3,
  total: 9,
  invoiceNumber: '899839',
  clientName: 'RETA ALIMENTOS LTDA',
  contractorName: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
  district: 'Centro',
  city: 'Guaira',
  address: 'R. 18, 1240 – Centro, Guaira/SP',
  volumes: '12 volumes',
  distance: '108 km',
  duration: '~1 h 25 min',
  coordinate: { latitude: -20.3186, longitude: -48.3108 },
}

const STOP_FOUR: MessageStop = {
  sequence: 4,
  total: 9,
  invoiceNumber: '899836',
  clientName: 'RETA ALIMENTOS LTDA',
  district: 'Centro',
  city: 'Sao Joaquim da Barra',
  distance: '56 km',
  duration: '~45 min',
  coordinate: { latitude: -20.5812, longitude: -47.8547 },
}

describe('formatDirectionsUrl (RF7b)', () => {
  test('abre a rota no Maps pela coordenada', () => {
    expect(formatDirectionsUrl({ latitude: -20.3186, longitude: -48.3108 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108',
    )
  })
})

describe('formatStopBlock', () => {
  test('lista: bairro e cidade, distância e tempo, link, sem citação', () => {
    expect(formatStopBlock({ stop: STOP_FOUR, detail: 'list' })).toBe(
      [
        '*PARADA 4 de 9*',
        '🧾 NF `899836` · *RETA ALIMENTOS LTDA*',
        '📍 Centro, Sao Joaquim da Barra',
        '📏 *56 km* · ⏱️ _~45 min_',
        '🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5812,-47.8547',
      ].join('\n'),
    )
  })

  test('lista: a próxima da rota em citação com cabeçalho próprio (RF6)', () => {
    expect(
      formatStopBlock({
        stop: STOP_THREE,
        detail: 'list',
        header: '👉 *PARADA 3 de 9* · _próxima da rota_',
        quote: 'right',
      }),
    ).toBe(
      [
        '> 👉 *PARADA 3 de 9* · _próxima da rota_',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 📍 Centro, Guaira',
        '> 📏 *108 km* · ⏱️ _~1 h 25 min_',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108',
      ].join('\n'),
    )
  })

  test('card: contratante, endereço completo e volumes, em citação', () => {
    expect(
      formatStopBlock({
        stop: { ...STOP_THREE, distance: undefined, duration: undefined },
        detail: 'card',
        quote: 'right',
      }),
    ).toBe(
      [
        '> *PARADA 3 de 9*',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 🏢 Contratante: COMERCIAL ZARAGOZA IMP EXP LTDA',
        '> 📍 R. 18, 1240 – Centro, Guaira/SP',
        '> 📦 12 volumes',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.3186,-48.3108',
      ].join('\n'),
    )
  })

  test('fora da rota: cabeçalho da escolhida, em citação', () => {
    expect(
      formatStopBlock({
        stop: {
          ...STOP_FOUR,
          sequence: 7,
          invoiceNumber: '899857',
          district: 'City Petropolis',
          city: 'Franca',
        },
        detail: 'list',
        header: '🚚 *VOCÊ ESCOLHEU · PARADA 7*',
        quote: 'off-route',
      }),
    ).toBe(
      [
        '> 🚚 *VOCÊ ESCOLHEU · PARADA 7*',
        '> 🧾 NF `899857` · *RETA ALIMENTOS LTDA*',
        '> 📍 City Petropolis, Franca',
        '> 📏 *56 km* · ⏱️ _~45 min_',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5812,-47.8547',
      ].join('\n'),
    )
  })

  test('linha sem dado some: sem coordenada, distância, bairro e cidade', () => {
    expect(
      formatStopBlock({
        stop: {
          sequence: 5,
          total: 9,
          invoiceNumber: '899862',
          clientName: 'SUPERMERCADO SAO PAULO LTDA',
        },
        detail: 'list',
      }),
    ).toBe(['*PARADA 5 de 9*', '🧾 NF `899862` · *SUPERMERCADO SAO PAULO LTDA*'].join('\n'))
  })

  test('lista: só a cidade quando não há bairro', () => {
    expect(
      formatStopBlock({
        stop: {
          ...STOP_FOUR,
          district: undefined,
          distance: undefined,
          duration: undefined,
          coordinate: undefined,
        },
        detail: 'list',
      }),
    ).toBe(
      ['*PARADA 4 de 9*', '🧾 NF `899836` · *RETA ALIMENTOS LTDA*', '📍 Sao Joaquim da Barra'].join(
        '\n',
      ),
    )
  })
})

describe('formatOptions (RF1)', () => {
  test('numera com ícone e ação inteira', () => {
    expect(
      formatOptions([
        { icon: '✅', action: 'Seguir para a *parada 7*' },
        { icon: '👉', action: 'Ir para a *parada 3*' },
      ]),
    ).toBe(['*1* - ✅ Seguir para a *parada 7*', '*2* - 👉 Ir para a *parada 3*'].join('\n'))
  })
})

describe('formatNotUnderstood (RF3b)', () => {
  test('motivo seguido das opções de novo', () => {
    expect(
      formatNotUnderstood({
        reason: 'Responda com o número da opção:',
        options: [
          { icon: '🚚', action: 'Saí para a entrega' },
          { icon: '📍', action: 'Cheguei' },
        ],
      }),
    ).toBe(
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - 🚚 Saí para a entrega',
        '*2* - 📍 Cheguei',
      ].join('\n'),
    )
  })

  test('sem opções, só o motivo', () => {
    expect(formatNotUnderstood({ reason: 'Não achei a parada 12 nesta viagem.' })).toBe(
      '🤔 *Não entendi.* Não achei a parada 12 nesta viagem.',
    )
  })

  test('opções por extenso, nunca só "1 ou 2"', () => {
    expect(
      formatNotUnderstood({
        reason: formatSpokenChoices([
          { action: 'seguir para a *parada 7*' },
          { action: 'ir para a *parada 3*' },
        ]),
      }),
    ).toBe(
      '🤔 *Não entendi.* Responda *1* para seguir para a *parada 7* ou *2* para ir para a *parada 3*.',
    )
  })
})

describe('formatNextStep e formatReplyHint (RF1)', () => {
  test('próximo passo na forma do desenho', () => {
    expect(formatNextStep('quando chegar, mande *cheguei*.')).toBe(
      '➡️ _Próximo passo:_ quando chegar, mande *cheguei*.',
    )
  })

  test('instrução de resposta em itálico', () => {
    expect(formatReplyHint('Responda com o número da parada ou da nota.')).toBe(
      '_Responda com o número da parada ou da nota._',
    )
  })
})
