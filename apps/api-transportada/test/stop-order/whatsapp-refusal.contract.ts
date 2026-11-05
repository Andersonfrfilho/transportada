/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF27: enquanto a pergunta 1/2 do bot não existe (T4.10), fora de ordem vira uma frase clara.
 */
import { describe, expect, test } from 'bun:test'

import { describeWhatsAppDriverEventRefusal } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import { classifyWhatsAppDriverEventError } from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { TripStopOutOfOrderError } from '../../src/trips/domain/stop-order.error.js'

describe('o WhatsApp diante do 409 de fora de ordem (spec 294 RF27)', () => {
  test('o erro vira recusa e a frase cita a parada pedida e a esperada', () => {
    const refusal = classifyWhatsAppDriverEventError(
      new TripStopOutOfOrderError({
        currentSequence: 3,
        currentStopId: 'stop-3',
        nextSequence: 3,
        nextStopId: 'stop-3',
        requestedSequence: 5,
        requestedStopId: 'stop-5',
      }),
    )

    expect(refusal).toEqual({
      code: 'stop_out_of_order',
      currentSequence: 3,
      nextSequence: 3,
      requestedSequence: 5,
    })
    if (refusal === undefined) throw new Error('EXPECTED_REFUSAL')

    const line = describeWhatsAppDriverEventRefusal(refusal, { kind: 'driver' })
    const text = 'text' in line ? line.text : ''
    expect(text).toContain('parada 3')
    expect(text).toContain('parada 5')
  })
})
