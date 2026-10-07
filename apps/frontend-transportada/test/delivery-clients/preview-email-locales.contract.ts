/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T4.6b (`web.md` §3): todo motivo de recusa que o CHECK da migration admite tem rótulo em pt-BR e em
 * inglês — um código cru na tabela é o operador adivinhando —, e os dois idiomas têm as mesmas chaves.
 */
import { describe, expect, test } from 'bun:test'

import enLocale from '../../src/modules/delivery-clients/locales/previewEmail.en.locale.json'
import ptLocale from '../../src/modules/delivery-clients/locales/previewEmail.locale.json'
import { PREVIEW_EMAIL_REASON_CODES } from '../../src/modules/delivery-clients/shared/previewEmail.types'

type LocaleTree = { readonly [key: string]: string | LocaleTree }

function flatten(tree: LocaleTree, prefix = ''): readonly (readonly [string, string])[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as const]
      : flatten(value, `${prefix}${key}.`),
  )
}

describe('os rótulos da prévia por e-mail (spec 237 T4.6b)', () => {
  test('pt-BR e inglês têm as mesmas chaves, nenhuma vazia', () => {
    const pt = flatten(ptLocale)
    const en = flatten(enLocale)

    expect(pt.map(([key]) => key).sort()).toEqual(en.map(([key]) => key).sort())
    for (const [key, value] of [...pt, ...en])
      expect([key, value.trim() === '']).toEqual([key, false])
  })

  test.each([...PREVIEW_EMAIL_REASON_CODES])(
    'o motivo %s tem rótulo nos dois idiomas, diferente do código',
    (code) => {
      const reasons = {
        en: (enLocale as { reasons: Record<string, string> }).reasons,
        pt: (ptLocale as { reasons: Record<string, string> }).reasons,
      }

      for (const language of ['en', 'pt'] as const) {
        const label = reasons[language][code]
        expect(typeof label).toBe('string')
        expect(label).not.toBe(code)
        expect(label?.includes('_')).toBe(false)
      }
    },
  )

  test('o resultado da recusa tem rótulo nos dois idiomas', () => {
    for (const locale of [ptLocale, enLocale]) {
      const outcomes = (locale as { outcomes: Record<string, string> }).outcomes
      expect(Object.keys(outcomes).sort()).toEqual(['accepted', 'rejected'])
    }
  })
})
