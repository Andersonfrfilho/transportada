/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T4.5 (critério 1): o fluxo 6 (Não entreguei) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * motivo, registro e "sem a nota" —, comparado inteiro. O registro é o mesmo texto no grupo e na conversa individual.
 */
import { describe, expect, test } from 'bun:test'

import {
  GROUP_RETURN_REASON_OPTIONS,
  GROUP_RETURN_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-return-flow.service.js'
import { describeWhatsAppDriverEventResult } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { interpolateBotSpeech } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.policy.js'

describe('spec 300 T4.5 — fluxo 6 Não entreguei', () => {
  test('por que a nota não foi entregue: cliente em citação e motivos com ícone', () => {
    expect(
      GROUP_RETURN_TEXT.askReason({
        city: 'Sao Joaquim da Barra',
        clientName: 'RETA ALIMENTOS LTDA',
        id: 'doc-b',
        number: '0899836',
      }),
    ).toBe(
      [
        '↩️ *Por que a NF `899836` não foi entregue?*',
        '> 🏪 RETA ALIMENTOS LTDA · Sao Joaquim da Barra',
        '',
        '*1* - 🚪 Destinatário ausente',
        '*2* - 🙅 Recusou receber',
        '*3* - 📍 Endereço não achado',
        '*4* - 📦 Carga avariada',
        '*5* - 🔒 Local fechado',
        '',
        '_Responda com o número do motivo._',
      ].join('\n'),
    )
  })

  test('as opções repetidas no "não entendi"', () => {
    expect(GROUP_RETURN_REASON_OPTIONS).toBe(
      [
        '*1* - 🚪 Destinatário ausente',
        '*2* - 🙅 Recusou receber',
        '*3* - 📍 Endereço não achado',
        '*4* - 📦 Carga avariada',
        '*5* - 🔒 Local fechado',
      ].join('\n'),
    )
  })

  test('nota não entregue, igual no grupo e na individual', () => {
    const render = (kind: 'driver' | 'group') => {
      const line = describeWhatsAppDriverEventResult(
        { event: 'return', kind: 'registered' } as never,
        { documentNumber: '899836', kind, returnReason: 'establishment_closed' },
      )
      if (!('key' in line)) throw new Error('expected a catalog line')
      return interpolateBotSpeech(BOT_SPEECH_DEFAULTS[line.key], line.params ?? {})
    }
    const expected = [
      '↩️ *NF `899836` não entregue* · Local fechado',
      'A nota volta com você para o armazém.',
    ].join('\n')
    expect(render('group')).toBe(expected)
    expect(render('driver')).toBe(expected)
  })

  test('sem a nota: pede o número', () => {
    expect(GROUP_RETURN_TEXT.whichDocument).toBe(
      [
        '↩️ *Qual nota não foi entregue?*',
        'Mande *não entreguei* com o número da nota.',
        '➡️ _Exemplo:_ não entreguei 899836',
      ].join('\n'),
    )
  })
})
