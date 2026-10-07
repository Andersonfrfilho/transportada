/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (`web.md` §6): todo texto da avaria e da devolução vive em `*.locale.json`, nos dois idiomas,
 * no namespace `cargoReceiving` — a mesma chave em pt-BR e em en, sem sobrar nem faltar. E o motivo
 * `DOCUMENT_RETURN_TO_CONTRACTOR` da proposta de chegada, mais os dois da separação, têm texto próprio.
 */
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { i18n } from '@/modules/shared/i18n/i18n.service'
import english from '@/modules/cargo-receiving/locales/cargoOccurrence.en.locale.json'
import portuguese from '@/modules/cargo-receiving/locales/cargoOccurrence.locale.json'
import englishCore from '@/modules/cargo-receiving/locales/cargoReceiving.en.locale.json'
import portugueseCore from '@/modules/cargo-receiving/locales/cargoReceiving.locale.json'

function flatten(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

const NEW_REASONS = [
  'CARGO_ARRIVAL_DOCUMENT_MARKED_FOR_RETURN',
  'CARGO_ARRIVAL_DOCUMENT_RETURNED',
  'DOCUMENT_RETURN_TO_CONTRACTOR',
] as const

describe('os textos da avaria nos dois idiomas (spec 237 T3.3)', () => {
  test('pt-BR e en têm exatamente as mesmas chaves', () => {
    expect([...flatten(english)].sort()).toEqual([...flatten(portuguese)].sort())
  })

  test('nenhum texto fica vazio', () => {
    for (const locale of [portuguese, english]) {
      const empty = flatten(locale).filter((path) => {
        const text = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], locale)
        return typeof text !== 'string' || text.trim() === ''
      })
      expect(empty).toEqual([])
    }
  })

  test('as chaves novas não escondem as da chegada: nenhuma colide com o dicionário de antes', () => {
    const core = new Set(Object.keys(portugueseCore))
    expect(Object.keys(portuguese).filter((key) => core.has(key))).toEqual([])
    expect(
      Object.keys(english).filter((key) => new Set(Object.keys(englishCore)).has(key)),
    ).toEqual([])
  })

  test('o i18n junta os dois arquivos no mesmo namespace `cargoReceiving`', () => {
    expect(i18n.getResource('pt-BR', 'cargoReceiving', 'occurrence.dialog.title')).toBeString()
    expect(i18n.getResource('en', 'cargoReceiving', 'occurrence.dialog.title')).toBeString()
    expect(i18n.getResource('pt-BR', 'cargoReceiving', 'eyebrow')).toBe('Recebimento da carga')
  })
})

describe('os motivos de recusa da devolução têm texto próprio', () => {
  test('a proposta e a separação dizem por que a nota marcada ou devolvida ficou de fora', () => {
    for (const reason of NEW_REASONS) {
      expect(portugueseCore.refusal.reasons).toHaveProperty(reason)
      expect(englishCore.refusal.reasons).toHaveProperty(reason)
    }
    expect(portugueseCore.refusal.reasons.DOCUMENT_RETURN_TO_CONTRACTOR).toContain('devol')
  })
})
