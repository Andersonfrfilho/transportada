/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.9: os textos da conferência em maço nos dois idiomas. Chave que falta num idioma cai
 * no pt-BR em silêncio, então a paridade é asserção. O maço aprova o que a pessoa viu: nenhum texto
 * pode falar em portão ("bloqueado") nem em recusa em massa — a máquina não recusa.
 */
import { describe, expect, it } from 'bun:test'

import englishLocale from '../../src/modules/trip/locales/trip.en.locale.json'
import portugueseLocale from '../../src/modules/trip/locales/trip.locale.json'

type LocaleNode = { readonly [key: string]: string | LocaleNode }

const BLOCKING_WORDS = ['bloque', 'trava', 'impede', 'inválid', 'invalid', 'block', 'prevent']
const REJECTION_WORDS = ['recus', 'reject', 'rejeit']
const UNACCENTED_SLIPS = /\b(conferencia|automatico|automatica|codigo|numero|nao)\b/

const PLURAL_BASES = [
  'stateActions.batchCanhoto',
  'stateActions.batchCanhotoExcluded',
  'deliveryProof.canhotoBatch.approve',
  'deliveryProof.canhotoBatch.overflow',
] as const

const SINGLE_KEYS = [
  'stateActions.batchCanhotoPartialFailure',
  'deliveryProof.canhotoBatch.approving',
  'deliveryProof.canhotoBatch.cancel',
  'deliveryProof.canhotoBatch.checkedCount',
  'deliveryProof.canhotoBatch.close',
  'deliveryProof.canhotoBatch.empty',
  'deliveryProof.canhotoBatch.imageFailed',
  'deliveryProof.canhotoBatch.loadFailed',
  'deliveryProof.canhotoBatch.loading',
  'deliveryProof.canhotoBatch.noteLabel',
  'deliveryProof.canhotoBatch.selectItem',
  'deliveryProof.canhotoBatch.subtitle',
  'deliveryProof.canhotoBatch.title',
  'deliveryProof.canhotoBatch.waitingImages',
] as const

function flatten(node: LocaleNode, prefix = ''): ReadonlyMap<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') entries.set(prefix + key, value)
    else for (const [nested, text] of flatten(value, `${prefix}${key}.`)) entries.set(nested, text)
  }
  return entries
}

function placeholdersOf(text: string): readonly string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort()
}

const portuguese = flatten(portugueseLocale)
const english = flatten(englishLocale)
const expectedKeys = [
  ...SINGLE_KEYS,
  ...PLURAL_BASES.flatMap((base) => [base, `${base}_other`]),
] as const

describe('os textos da conferência em maço nos dois idiomas (spec 222 T2.9)', () => {
  it('toda chave esperada existe, não vazia, nos dois idiomas', () => {
    for (const key of expectedKeys) {
      expect([key, (portuguese.get(key) ?? '').trim() === '']).toEqual([key, false])
      expect([key, (english.get(key) ?? '').trim() === '']).toEqual([key, false])
    }
  })

  it('os placeholders são os mesmos nos dois idiomas', () => {
    for (const key of expectedKeys) {
      expect([key, placeholdersOf(english.get(key) ?? '')]).toEqual([
        key,
        placeholdersOf(portuguese.get(key) ?? ''),
      ])
    }
  })

  it('o plural carrega a contagem; o aviso de falha parcial, falhas e total', () => {
    for (const base of PLURAL_BASES) {
      expect(placeholdersOf(portuguese.get(base) ?? '')).toContain('count')
      expect(placeholdersOf(portuguese.get(`${base}_other`) ?? '')).toContain('count')
    }
    expect(placeholdersOf(portuguese.get('stateActions.batchCanhotoPartialFailure') ?? '')).toEqual(
      ['failed', 'total'],
    )
  })

  it('nenhum texto sugere portão nem recusa em massa', () => {
    for (const key of expectedKeys) {
      for (const text of [portuguese.get(key) ?? '', english.get(key) ?? '']) {
        const lowered = text.toLowerCase()
        for (const word of [...BLOCKING_WORDS, ...REJECTION_WORDS]) {
          expect([key, word, lowered.includes(word)]).toEqual([key, word, false])
        }
      }
    }
  })

  it('o pt-BR não traz palavra sem acento', () => {
    for (const key of expectedKeys) {
      expect([key, UNACCENTED_SLIPS.test((portuguese.get(key) ?? '').toLowerCase())]).toEqual([
        key,
        false,
      ])
    }
  })
})
