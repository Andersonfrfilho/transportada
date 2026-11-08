/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T5.3 (RF11): o fluxo 9 (Encerrar a rota) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * a pergunta e o desfecho dizem quais notas ficam sem baixa —, comparado inteiro.
 */
import { describe, expect, test } from 'bun:test'

import { GROUP_TRIP_CLOSE_TEXT } from '../../src/whatsapp/application/whatsapp-group-trip-close-flow.service.js'
import { ATTENDANT_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-attendant-flow.constant.js'

const OPTIONS = ['*1* - ✅ Sim, encerrar', '*2* - ↩️ Não, deixar aberta']
const ELEVEN = Array.from({ length: 11 }, (_, index) => String(900000 + index))

describe('spec 300 T5.3 — fluxo 9 Encerrar a rota', () => {
  test('pergunta com duas notas em aberto', () => {
    expect(GROUP_TRIP_CLOSE_TEXT.confirm(['899862', '899857'])).toBe(
      [
        '🏁 *Encerrar a rota?*',
        '⚠️ Ainda há *2 notas em aberto*: NF `899862` e NF `899857`.',
        '',
        ...OPTIONS,
      ].join('\n'),
    )
  })

  test('pergunta com uma nota e com nenhuma', () => {
    expect(GROUP_TRIP_CLOSE_TEXT.confirm(['899862'])).toBe(
      [
        '🏁 *Encerrar a rota?*',
        '⚠️ Ainda há *1 nota em aberto*: NF `899862`.',
        '',
        ...OPTIONS,
      ].join('\n'),
    )
    expect(GROUP_TRIP_CLOSE_TEXT.confirm([])).toBe(
      ['🏁 *Encerrar a rota?*', '✅ Todas as notas já estão fechadas.', '', ...OPTIONS].join('\n'),
    )
  })

  test('desfecho diz o que ficou sem baixa, nunca que volta ao escritório', () => {
    expect(GROUP_TRIP_CLOSE_TEXT.closed(['899862', '899857'])).toBe(
      '🏁 *Rota encerrada.* Ficaram sem baixa: NF `899862` e NF `899857`.',
    )
    expect(GROUP_TRIP_CLOSE_TEXT.closed(['899862', '899857', '899800'])).toBe(
      '🏁 *Rota encerrada.* Ficaram sem baixa: NF `899862`, NF `899857` e NF `899800`.',
    )
    expect(GROUP_TRIP_CLOSE_TEXT.closed([])).toBe('🏁 *Rota encerrada.*')
  })

  test('lista longa corta em 10 números e diz "e mais K"', () => {
    const shown = ELEVEN.slice(0, 10)
      .map((number) => `NF \`${number}\``)
      .join(', ')
    expect(ATTENDANT_TEXT.confirm(ELEVEN)).toBe(
      `⚠️ Ainda há *11 notas em aberto*: ${shown} e mais 1.`,
    )
    expect(ATTENDANT_TEXT.closed(ELEVEN)).toBe(
      `🏁 *Rota encerrada.* Ficaram sem baixa: ${shown} e mais 1.`,
    )
  })

  test('conversa individual usa as mesmas frases', () => {
    expect(ATTENDANT_TEXT.confirm(['899862', '899857'])).toBe(
      '⚠️ Ainda há *2 notas em aberto*: NF `899862` e NF `899857`.',
    )
    expect(ATTENDANT_TEXT.closed(['899862'])).toBe(
      '🏁 *Rota encerrada.* Ficaram sem baixa: NF `899862`.',
    )
  })
})
