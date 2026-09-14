/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 (D4) — os parâmetros da seleção, um por mensagem, e a validação do texto livre que
 * é parâmetro pedido (D8): número inteiro, final ≥ inicial, data `dd/mm/aaaa`.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildEmitterKey,
  nextSelectionStep,
  parseBrazilianDate,
  parseDocumentNumber,
  readSelectionState,
  resolveDueDate,
  toIssueDateWindow,
} from '../../src/whatsapp-commands/domain/document-selection.policy.js'
import { ISSUANCE_FLOW_CONTEXT_KEY } from '../../src/whatsapp-commands/domain/whatsapp-issuance-flow.constant.js'

describe('nextSelectionStep — um parâmetro por mensagem, na ordem da D4', () => {
  test('sem critério, pergunta o critério', () => {
    expect(nextSelectionStep({})).toBe('criterion')
  })

  test('faixa: emitente → série → inicial → final', () => {
    expect(nextSelectionStep({ criterion: 'number_range' })).toBe('emitter')
    expect(nextSelectionStep({ criterion: 'number_range', emitterKey: 'em_1' })).toBe('series')
    expect(nextSelectionStep({ criterion: 'number_range', emitterKey: 'em_1', series: '1' })).toBe(
      'first_number',
    )
    expect(
      nextSelectionStep({
        criterion: 'number_range',
        emitterKey: 'em_1',
        firstNumber: 1200,
        series: '1',
      }),
    ).toBe('last_number')
    expect(
      nextSelectionStep({
        criterion: 'number_range',
        emitterKey: 'em_1',
        firstNumber: 1200,
        lastNumber: 1250,
        series: '1',
      }),
    ).toBe('complete')
  })

  test('viagem: só a viagem', () => {
    expect(nextSelectionStep({ criterion: 'trip' })).toBe('trip')
    expect(nextSelectionStep({ criterion: 'trip', tripId: 't' })).toBe('complete')
  })

  test('data: inicial → final → emitente', () => {
    expect(nextSelectionStep({ criterion: 'issue_date' })).toBe('start_date')
    expect(nextSelectionStep({ criterion: 'issue_date', startDate: '2026-09-01' })).toBe('end_date')
    expect(
      nextSelectionStep({
        criterion: 'issue_date',
        endDate: '2026-09-10',
        startDate: '2026-09-01',
      }),
    ).toBe('date_emitter')
    expect(
      nextSelectionStep({
        criterion: 'issue_date',
        emitterKey: 'em_1',
        endDate: '2026-09-10',
        startDate: '2026-09-01',
      }),
    ).toBe('complete')
  })

  test('remetente: só o remetente', () => {
    expect(nextSelectionStep({ criterion: 'sender' })).toBe('emitter')
    expect(nextSelectionStep({ criterion: 'sender', emitterKey: 'em_1' })).toBe('complete')
  })
})

describe('parseDocumentNumber', () => {
  test.each([
    ['1200', 1200],
    [' 1250 ', 1250],
    ['999999999', 999_999_999],
  ])('aceita "%s"', (text, expected) => {
    expect(parseDocumentNumber(text)).toBe(expected)
  })

  test.each(['', '0', '-3', '12a', '1.200', '1e3', '1234567890', 'mil'])('recusa "%s"', (text) => {
    expect(parseDocumentNumber(text)).toBeUndefined()
  })
})

describe('parseBrazilianDate', () => {
  test('dd/mm/aaaa vira data ISO', () => {
    expect(parseBrazilianDate('01/09/2026')).toBe('2026-09-01')
    expect(parseBrazilianDate(' 29/02/2028 ')).toBe('2028-02-29')
  })

  test.each(['2026-09-01', '1/9/2026', '31/02/2026', '29/02/2026', '00/01/2026', '12/13/2026'])(
    'recusa "%s"',
    (text) => {
      expect(parseBrazilianDate(text)).toBeUndefined()
    },
  )
})

describe('toIssueDateWindow — o dia é o de Brasília, e o fim é exclusivo', () => {
  test('de 01/09 a 10/09 cobre do começo do dia 1 ao começo do dia 11, em -03:00', () => {
    expect(toIssueDateWindow({ endDate: '2026-09-10', startDate: '2026-09-01' })).toEqual({
      from: new Date('2026-09-01T03:00:00.000Z'),
      until: new Date('2026-09-11T03:00:00.000Z'),
    })
  })
})

describe('resolveDueDate', () => {
  test('soma os dias à data de Brasília, não à data UTC', () => {
    // 01:00 UTC do dia 12 ainda é dia 11 em Brasília.
    expect(resolveDueDate({ days: 15, now: new Date('2026-09-12T01:00:00.000Z') })).toBe(
      '2026-09-26',
    )
    expect(resolveDueDate({ days: 7, now: new Date('2026-12-28T15:00:00.000Z') })).toBe(
      '2027-01-04',
    )
  })
})

describe('buildEmitterKey — o documento do emitente nunca entra no context', () => {
  test('é opaca, estável e ignora máscara', () => {
    const key = buildEmitterKey('11111111000191')
    expect(key).toBe(buildEmitterKey('11.111.111/0001-91'))
    expect(key).not.toContain('11111111')
    expect(key).toMatch(/^em_[0-9a-f]{16}$/)
    expect(buildEmitterKey('12345678901')).not.toContain('12345678901')
  })
})

describe('readSelectionState', () => {
  test('lê só o que tem o tipo certo; o resto é ausência', () => {
    const state = readSelectionState({
      [ISSUANCE_FLOW_CONTEXT_KEY.criterion]: 'number_range',
      [ISSUANCE_FLOW_CONTEXT_KEY.emitterKey]: 'em_1',
      [ISSUANCE_FLOW_CONTEXT_KEY.firstNumber]: 1200,
      [ISSUANCE_FLOW_CONTEXT_KEY.lastNumber]: '1250',
      [ISSUANCE_FLOW_CONTEXT_KEY.series]: '1',
    })
    expect(state).toEqual({
      criterion: 'number_range',
      emitterKey: 'em_1',
      firstNumber: 1200,
      series: '1',
    })
  })

  test('critério desconhecido é ausência', () => {
    expect(readSelectionState({ [ISSUANCE_FLOW_CONTEXT_KEY.criterion]: 'qualquer' })).toEqual({})
  })
})
