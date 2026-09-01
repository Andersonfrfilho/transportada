/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import englishLocale from '@/modules/document-intake/locales/documentIntake.en.locale.json'
import locale from '@/modules/document-intake/locales/documentIntake.locale.json'

function listKeys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]

  return Object.entries(value).flatMap(([key, nested]) =>
    listKeys(nested, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('o texto da leitura de documento', () => {
  it('tem as mesmas chaves nas duas línguas', () => {
    expect(listKeys(englishLocale).toSorted()).toEqual(listKeys(locale).toSorted())
  })
})
