/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import englishLocale from '@/modules/trip/locales/trip.en.locale.json'
import locale from '@/modules/trip/locales/trip.locale.json'

type FlatLocale = {
  readonly leaves: ReadonlyMap<string, string>
  readonly branches: ReadonlySet<string>
}

function flatten(
  value: unknown,
  prefix: string,
  flat: { leaves: Map<string, string>; branches: Set<string> },
): void {
  if (typeof value === 'object' && value !== null) {
    if (prefix !== '') flat.branches.add(prefix)
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix === '' ? key : `${prefix}.${key}`, flat)
    }
    return
  }
  flat.leaves.set(prefix, String(value))
}

function flattenLocale(value: unknown): FlatLocale {
  const flat = { leaves: new Map<string, string>(), branches: new Set<string>() }
  flatten(value, '', flat)
  return flat
}

function listInterpolations(text: string): readonly string[] {
  return [...new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])].toSorted()
}

const portuguese = flattenLocale(locale)
const english = flattenLocale(englishLocale)

describe('o texto da viagem nas duas línguas', () => {
  test('toda chave folha do português existe no inglês, e vice-versa', () => {
    const missingInEnglish = [...portuguese.leaves.keys()].filter((key) => !english.leaves.has(key))
    const missingInPortuguese = [...english.leaves.keys()].filter(
      (key) => !portuguese.leaves.has(key),
    )

    expect({ missingInEnglish, missingInPortuguese }).toEqual({
      missingInEnglish: [],
      missingInPortuguese: [],
    })
  })

  test('nenhum caminho é folha numa língua e objeto na outra', () => {
    const shapeMismatches = [
      ...[...portuguese.leaves.keys()].filter((key) => english.branches.has(key)),
      ...[...portuguese.branches].filter((key) => english.leaves.has(key)),
    ].toSorted()

    expect(shapeMismatches).toEqual([])
  })

  test('os marcadores de interpolação são os mesmos nas duas línguas', () => {
    const divergences = [...portuguese.leaves.entries()].flatMap(([key, text]) => {
      const englishText = english.leaves.get(key)
      if (englishText === undefined) return []
      const expected = listInterpolations(text)
      const actual = listInterpolations(englishText)
      return expected.join('|') === actual.join('|')
        ? []
        : [`${key}: pt ${expected.join(',')} / en ${actual.join(',')}`]
    })

    expect(divergences).toEqual([])
  })
})
