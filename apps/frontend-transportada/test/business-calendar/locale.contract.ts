/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §6): todo texto do calendário vive em `*.locale.json`, com o mesmo conjunto de chaves nos
 * dois idiomas e as mesmas interpolações; todo código de recusa tem texto; o aviso fixo do roteiro está nos dois.
 */
import { describe, expect, test } from 'bun:test'

import english from '@/modules/company-settings/locales/businessCalendar.en.locale.json'
import portuguese from '@/modules/company-settings/locales/businessCalendar.locale.json'
import { BUSINESS_CALENDAR_REFUSAL_CODES } from '@/modules/company-settings/shared/businessCalendar.constant'

type Tree = Readonly<{ [key: string]: string | Tree }>

function flatten(tree: Tree, prefix = ''): Readonly<Record<string, string>> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') flat[path] = value
    else Object.assign(flat, flatten(value, path))
  }
  return flat
}

function placeholdersOf(text: string): readonly string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map((match) => match[1] ?? '').sort()
}

const PT = flatten(portuguese)
const EN = flatten(english)

describe('paridade pt-BR × en do calendário', () => {
  test('as mesmas chaves nos dois idiomas', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(PT).sort())
  })

  test('nenhum texto vazio, e a mesma lista de interpolações em cada chave', () => {
    for (const [key, text] of Object.entries(PT)) {
      expect(text.trim().length > 0).toBe(true)
      expect(placeholdersOf(EN[key] ?? '')).toEqual(placeholdersOf(text))
    }
  })

  test('todo código de recusa conhecido tem texto nos dois idiomas', () => {
    for (const code of BUSINESS_CALENDAR_REFUSAL_CODES) {
      expect(typeof PT[`errors.${code}`]).toBe('string')
      expect(typeof EN[`errors.${code}`]).toBe('string')
    }
    expect(typeof PT['errors.generic']).toBe('string')
    expect(typeof EN['errors.generic']).toBe('string')
  })

  test('o aviso fixo diz que o roteiro fecha só as datas geradas pela regra, até o ano', () => {
    expect(PT['notice.routing']).toContain('{{year}}')
    expect(EN['notice.routing']).toContain('{{year}}')
    expect(PT['notice.routing']).toContain('feriados nacionais e estaduais não fecham clientes')
    expect(PT['notice.routing']).toContain('o prazo de entrega por contratante conta todos')
    expect(EN['notice.routing']).toContain('national and state holidays do not close customers')
    expect(EN['notice.routing']).toContain(
      'the delivery deadline per contractor counts all of them',
    )
  })
})
