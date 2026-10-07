/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (`web.md` §6): todo texto da tratativa da avaria de recebimento e todo código de erro que ela
 * pode devolver tem texto em pt-BR e em en, no namespace `cargoReceiving`. Os códigos novos da T3.4a e o 429
 * nomeiam o motivo — nunca caem no "Não foi possível concluir (CÓDIGO)".
 */
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { i18n } from '@/modules/shared/i18n/i18n.service'
import { resolveOccurrenceErrorKeys } from '@/modules/cargo-receiving/shared/cargoOccurrenceRefusal.service'

/** Os códigos que as ações da tratativa, o acerto, a marcação e a conclusão da devolução devolvem. */
const ERROR_CODES = [
  'CARGO_ARRIVAL_RETURN_CASE_CANCELLED',
  'CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP',
  'CARGO_ARRIVAL_RETURN_DECISION_PENDING',
  'OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED',
  'OCCURRENCE_CASE_NOTE_REQUIRED',
  'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS',
  'OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED',
  'OCCURRENCE_CASE_REDELIVERY_BLOCKED_HAS_NO_QUESTION',
  'OCCURRENCE_CASE_DECISION_CONFLICT',
  'OCCURRENCE_CASE_NOT_FOUND',
  'OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN',
  'OCCURRENCE_SETTLEMENT_AMOUNT_INVALID',
  'OCCURRENCE_SETTLEMENT_PAYER_INVALID',
  'TOO_MANY_REQUESTS',
  'FORBIDDEN',
] as const

function translate(input: { code: string; language: 'en' | 'pt-BR' }): string {
  const [specific, general, fallback] = resolveOccurrenceErrorKeys(input.code)
  const keys = [specific ?? '', general ?? '', fallback ?? '']
  return i18n.t(keys, { code: input.code, lng: input.language, ns: 'cargoReceiving' })
}

describe('os erros da tratativa têm texto próprio nos dois idiomas', () => {
  for (const language of ['pt-BR', 'en'] as const) {
    test(`${language}: nenhum código cai no genérico nem aparece cru`, () => {
      const generic = translate({ code: 'CODIGO_QUE_NAO_EXISTE', language })
      for (const code of ERROR_CODES) {
        const text = translate({ code, language })
        expect(text).not.toBe(generic)
        expect(text).not.toContain(code)
        expect(text.trim()).not.toBe('')
      }
    })
  }

  test('o 429 fala em esperar, o 409 da origem cancelada fala em tratativa cancelada', () => {
    expect(translate({ code: 'TOO_MANY_REQUESTS', language: 'pt-BR' })).toContain('Aguarde')
    expect(translate({ code: 'CARGO_ARRIVAL_RETURN_CASE_CANCELLED', language: 'pt-BR' })).toContain(
      'cancelada',
    )
  })
})

describe('os textos da tela da tratativa', () => {
  const KEYS = [
    'occurrence.caseActions.review',
    'occurrence.caseActions.submit',
    'occurrence.caseActions.decide',
    'occurrence.caseActions.close',
    'occurrence.caseActions.warehouseReturn',
    'occurrence.caseActions.cancel',
    'occurrence.caseActions.closeBlockedByDraft',
    'occurrence.caseActions.settlementRequired',
    'occurrence.hints.returnCaseCancelled',
    'occurrence.dialog.typesEmpty',
    'occurrence.dialog.submitBlockedNoTypes',
    'occurrence.settlement.save',
    'group.aside',
  ] as const

  for (const language of ['pt-BR', 'en'] as const) {
    test(`${language}: cada chave existe e tem texto`, () => {
      for (const key of KEYS) {
        const text = i18n.t(key, { count: 1, lng: language, ns: 'cargoReceiving' })
        expect(text).not.toBe(key)
        expect(text.trim()).not.toBe('')
      }
    })
  }

  test('o texto do aviso da origem cancelada é o pedido: "Tratativa cancelada — desfaça a devolução"', () => {
    expect(
      i18n.t('occurrence.hints.returnCaseCancelled', { lng: 'pt-BR', ns: 'cargoReceiving' }),
    ).toBe('Tratativa cancelada — desfaça a devolução')
  })

  test('o aviso do seletor de tipos vazio é o pedido', () => {
    expect(i18n.t('occurrence.dialog.typesEmpty', { lng: 'pt-BR', ns: 'cargoReceiving' })).toBe(
      'Nenhum tipo de avaria de recebimento cadastrado. Avise o suporte.',
    )
  })
})
