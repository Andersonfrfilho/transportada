/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T4.4 (critério 1): "Entrega fora da rota e nota já baixada" do fluxo 5 (Entreguei) de
 * `specs/300-o-bot-fala-num-padrao-so/conversas.html`, comparadas inteiras. O desenho mostra um bloco só na entrega
 * (a parada escolhida, em citação, sem distância); a pergunta do "não entendi" repete as opções por extenso.
 */
import { describe, expect, test } from 'bun:test'

import { describeAlreadySettled } from '../../src/whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import {
  describeOutOfOrderNotUnderstood,
  describeOutOfOrderViolation,
  toOrderStopLabel,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-order.policy.js'

const STOP_THREE = {
  city: 'Guaira',
  coordinate: { latitude: -20.3186, longitude: -48.3108 },
  district: 'Centro',
  documents: [{ number: '899839', recipientName: 'RETA ALIMENTOS LTDA' }],
  id: 'stop-3',
  sequence: 3,
}

const STOP_SEVEN = {
  city: 'Franca',
  coordinate: { latitude: -20.5139, longitude: -47.389 },
  district: 'City Petropolis',
  documents: [{ number: '899857', recipientName: 'BRANDINELI COMERCIO ATACADISTA DE MERCAD' }],
  id: 'stop-7',
  sequence: 7,
}

const VIOLATION = {
  currentSequence: 3,
  currentStopId: 'stop-3',
  nextSequence: 3,
  nextStopId: 'stop-3',
  requestedSequence: 7,
  requestedStopId: 'stop-7',
} as const

describe('spec 300 T4.4 — fluxo 5 Entreguei: fora da rota e nota já baixada', () => {
  test('entrega fora da rota sugerida', () => {
    const labels = new Map(
      [STOP_THREE, STOP_SEVEN].map((stop) => [
        stop.id,
        toOrderStopLabel(stop as never, { total: 9 }),
      ]),
    )
    expect(
      describeOutOfOrderViolation({
        documentNumber: '899857',
        event: 'deliver',
        labels,
        violation: VIOLATION,
      }),
    ).toBe(
      [
        '⚠️ *Fora da rota sugerida*',
        'Você está na *parada 3*, e a NF `899857` é da *parada 7*. Se achar melhor, pode registrar.',
        '',
        '> ✅ *ENTREGA · PARADA 7*',
        '> 🧾 NF `899857` · *BRANDINELI COMERCIO ATACADISTA DE MERCAD*',
        '> 📍 City Petropolis, Franca',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-20.5139,-47.389',
        '',
        '*1* - ✅ Entreguei na *parada 7*',
        '*2* - ↩️ Foi engano, descartar',
        '',
        '_A parada 3 continua aberta. Responda 1 ou 2._',
      ].join('\n'),
    )
  })

  test('"não entendi" da entrega fora da rota repete as opções por extenso', () => {
    expect(describeOutOfOrderNotUnderstood({ event: 'deliver', requested: 7 })).toBe(
      [
        '🤔 *Não entendi.* Responda *1* para registrar a entrega na *parada 7* ou *2* para descartar.',
      ].join('\n'),
    )
  })

  test('nota já baixada: entregue e devolvida', () => {
    const settled = { documentNumber: '899839', now: new Date(), settledAt: '2026-11-07T02:41:00Z' }
    expect(describeAlreadySettled({ ...settled, returned: false })).toBe(
      '⚠️ *A entrega da NF `899839` já foi registrada* às 23:41.\nNada foi gravado de novo.',
    )
    expect(describeAlreadySettled({ ...settled, returned: true })).toBe(
      '⚠️ *A NF `899839` já foi baixada como não entregue* às 23:41.\nNada foi gravado de novo.',
    )
  })
})
