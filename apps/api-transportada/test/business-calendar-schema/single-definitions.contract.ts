/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3b: o que o módulo do calendário afirma uma vez só. A política das rotas, o filtro de
 * query e o padrão da cidade não se redeclaram por arquivo (regra de strings repetidas), e o que vem
 * do banco passa por um guarda de tipo, não por um `as`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

import {
  toHolidayRecord,
  toRuleRecord,
} from '../../src/business-calendar/infrastructure/business-calendar-rule.mapper.js'

const MODULE = new URL('../../src/business-calendar/', import.meta.url)

function sources(directory: string): readonly { readonly name: string; readonly text: string }[] {
  const base = new URL(`${directory}/`, MODULE)
  return readdirSync(base)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(new URL(name, base), 'utf8') }))
}

function occurrences(directory: string, pattern: RegExp): readonly string[] {
  return sources(directory).flatMap(({ name, text }) => [...text.matchAll(pattern)].map(() => name))
}

const RULE_ROW = {
  cityIbgeCode: '3509502',
  companyId: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date('2026-10-07T12:00:00.000Z'),
  day: 14,
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'feast',
  materializedThroughYear: 2036,
  month: 7,
  name: 'Aniversário',
  updatedAt: new Date('2026-10-07T12:00:00.000Z'),
}

describe('uma definição só no módulo do calendário (spec 238 T1.3b)', () => {
  test('o filtro de query existe uma vez, na camada de apresentação', () => {
    expect(occurrences('presentation', /function readFilter\(/gu)).toHaveLength(1)
  })

  test('nenhuma rota declara a própria política: ela vem da constante do módulo', () => {
    const routes = sources('presentation').filter(({ name }) => name.endsWith('.routes.ts'))

    expect(routes.length).toBeGreaterThanOrEqual(4)
    for (const { name, text } of routes) {
      expect({ name, inline: text.includes("permission: '") }).toEqual({ inline: false, name })
    }
    const constant = readFileSync(
      new URL('presentation/business-calendar-policy.constant.ts', MODULE),
      'utf8',
    )
    expect(constant).toContain('BUSINESS_CALENDAR_MANAGE_POLICY')
    expect(constant).toContain('BUSINESS_CALENDAR_READ_POLICY')
  })

  test('o padrão de sete dígitos da cidade vem de `shared/`, não de uma cópia no módulo', () => {
    for (const directory of ['application', 'domain', 'infrastructure', 'presentation']) {
      expect({ directory, copies: occurrences(directory, /\[0-9\]\{7\}/gu) }).toEqual({
        copies: [],
        directory,
      })
    }
  })

  test('as visões das rotas têm tipo próprio, não `object`', () => {
    for (const { name, text } of sources('presentation')) {
      expect({ name, untyped: /\): object \{/u.test(text) }).toEqual({ name, untyped: false })
    }
  })
})

describe('o que vem do banco passa por guarda de tipo (spec 238 T1.3b)', () => {
  test('o mapper não afirma o tipo com `as`', () => {
    const text = readFileSync(
      new URL('infrastructure/business-calendar-rule.mapper.ts', MODULE),
      'utf8',
    )

    expect(text).not.toMatch(/\bas MunicipalHolidayKind\b/u)
    expect(text).not.toMatch(/\) as \w/u)
  })

  test('tipo desconhecido na linha é defeito de persistência, não um tipo qualquer', () => {
    expect(() => toRuleRecord(RULE_ROW)).toThrow()
    expect(() =>
      toHolidayRecord({
        cityIbgeCode: '3509502',
        companyId: RULE_ROW.companyId,
        createdAt: RULE_ROW.createdAt,
        holidayOn: '2026-07-14',
        id: RULE_ROW.id,
        kind: 'feast',
        name: 'Aniversário',
        providerEntryId: null,
        sourceRuleId: null,
      }),
    ).toThrow()
    expect(toRuleRecord({ ...RULE_ROW, kind: 'city_anniversary' }).kind).toBe('city_anniversary')
  })
})
