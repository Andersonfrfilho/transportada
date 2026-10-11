/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): paridade painel <-> API lida do FONTE da API, no molde de `test/shared/job-catalog.contract.ts`.
 * As guardas do painel são de chaves exatas: uma chave a mais ou a menos de um lado só aparece em produção, como a tela
 * que recusa a resposta inteira. A regra da chave e o teto do orçamento também são cópia por valor.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  HOLIDAY_ENABLEMENT_ORIGINS,
  HOLIDAY_PROVIDER_BUDGET_MAX,
  HOLIDAY_PROVIDER_BUDGET_MIN,
  HOLIDAY_PROVIDER_BUDGET_ORIGINS,
  HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH,
  HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH,
  HOLIDAY_PROVIDER_TOKEN_PATTERN,
} from '@/modules/company-settings/shared/holidayProviderSettings.constant'
import {
  ENABLEMENT_KEYS,
  PROVIDER_SETTINGS_KEYS,
} from '@/modules/company-settings/shared/holidayProviderSettingsGuards.validation'

const API_ROOT = '../../../api-transportada/src/'

function readApiSource(relativePath: string): string {
  return readFileSync(new URL(`${API_ROOT}${relativePath}`, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm,
    '',
  )
}

const SETTINGS_SCHEMA = readApiSource(
  'business-calendar/presentation/holiday-provider-settings.schema.ts',
)
const ENABLEMENT_ROUTES = readApiSource(
  'business-calendar/presentation/holiday-import-enablement.routes.ts',
)
const TOKEN_CONSTANTS = readApiSource(
  'business-calendar/domain/holiday-provider-settings.constant.ts',
)
const BUDGET_CONSTANTS = readApiSource('shared/holiday-provider.constant.ts')

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`${signature} not found in the API source`)
  const open = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(open, index + 1)
  }
  throw new Error(`${signature} is not closed in the API source`)
}

type Frame = { expectsKey: boolean; keys: string[]; parenthesisDepth: number }

/** As chaves de cada `{ ... }` do trecho, no nível do próprio literal; só as que têm mais de uma chave são literais de dado. */
function literalKeys(body: string): readonly (readonly string[])[] {
  const finished: string[][] = []
  const stack: Frame[] = []
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] ?? ''
    const frame = stack.at(-1)
    if (character === '{') {
      stack.push({ expectsKey: true, keys: [], parenthesisDepth: 0 })
    } else if (character === '}') {
      finished.push(stack.pop()?.keys ?? [])
    } else if (frame === undefined) {
      continue
    } else if (character === '(' || character === '[') {
      frame.parenthesisDepth += 1
    } else if (character === ')' || character === ']') {
      frame.parenthesisDepth -= 1
    } else if (character === ',' && frame.parenthesisDepth === 0) {
      frame.expectsKey = true
    } else if (frame.expectsKey && /\S/.test(character)) {
      const key = /^(\w+)\s*:/.exec(body.slice(index))
      if (key?.[1] !== undefined) frame.keys.push(key[1])
      frame.expectsKey = false
    }
  }
  return finished.filter((keys) => keys.length > 1)
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort()
}

function readApiNumber(source: string, name: string): number {
  const match = new RegExp(`export const ${name} = ([0-9_]+)`).exec(source)
  if (match?.[1] === undefined) throw new Error(`${name} not found in the API source`)
  return Number(match[1].replaceAll('_', ''))
}

describe('chaves exatas das respostas: o painel iguala o fonte da API (spec 262 T6.1b)', () => {
  test('a configuração da instalação: as duas respostas da API (sem linha e com linha) têm as chaves do painel', () => {
    const body = functionBody(SETTINGS_SCHEMA, 'export function toHolidayProviderSettingsView(')
    const literals = literalKeys(body)

    expect(literals).toHaveLength(2)
    for (const keys of literals) expect(sorted(keys)).toEqual(sorted(PROVIDER_SETTINGS_KEYS))
  })

  test('o liga/desliga da empresa: as duas respostas da API (sem linha e com linha) têm as chaves do painel', () => {
    const body = functionBody(ENABLEMENT_ROUTES, 'function enablementResponse(')
    const literals = literalKeys(body)

    expect(literals).toHaveLength(2)
    for (const keys of literals) expect(sorted(keys)).toEqual(sorted(ENABLEMENT_KEYS))
  })

  test('as origens do orçamento e do liga/desliga são as que a API escreve', () => {
    const budgetLines = SETTINGS_SCHEMA.split('\n').filter((line) => line.includes('budgetOrigin:'))
    const budgetOrigins = budgetLines.flatMap((line) =>
      [...line.matchAll(/'([a-z]+)'/g)].map((match) => match[1] ?? ''),
    )
    const enablementOrigins = [
      ...(/const ENABLEMENT_ORIGIN = \{([^}]*)\}/.exec(ENABLEMENT_ROUTES)?.[1] ?? '').matchAll(
        /'([a-z]+)'/g,
      ),
    ].map((match) => match[1] ?? '')

    expect(sorted([...new Set(budgetOrigins)])).toEqual(sorted(HOLIDAY_PROVIDER_BUDGET_ORIGINS))
    expect(sorted(enablementOrigins)).toEqual(sorted(HOLIDAY_ENABLEMENT_ORIGINS))
  })
})

describe('a regra da chave e o teto do orçamento: o painel iguala a API (spec 262 T6.1b)', () => {
  /** Reconstrói a regex da API do texto do fonte: o `new RegExp(` com os dois comprimentos já resolvidos. */
  function readApiTokenPattern(): RegExp {
    const declaration = /new RegExp\(\s*`([^`]+)`,\s*'([a-z]*)'/.exec(TOKEN_CONSTANTS)
    if (declaration?.[1] === undefined) throw new Error('the token pattern changed shape')
    const source = declaration[1]
      .replace('${HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH}', String(readApiToken('MIN_LENGTH')))
      .replace('${HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH}', String(readApiToken('MAX_LENGTH')))
      .replaceAll('\\\\', '\\')
    return new RegExp(source, declaration[2])
  }

  function readApiToken(suffix: 'MAX_LENGTH' | 'MIN_LENGTH'): number {
    return readApiNumber(TOKEN_CONSTANTS, `HOLIDAY_PROVIDER_TOKEN_${suffix}`)
  }

  test('o comprimento mínimo e o máximo da chave são os da API', () => {
    expect(HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH).toBe(readApiToken('MIN_LENGTH'))
    expect(HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH).toBe(readApiToken('MAX_LENGTH'))
  })

  test('o padrão da chave tem a mesma fonte e as mesmas opções que o da API', () => {
    const apiPattern = readApiTokenPattern()

    expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.source).toBe(apiPattern.source)
    expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.flags).toBe(apiPattern.flags)
  })

  test.each([
    ['15 caracteres', 'a'.repeat(15)],
    ['16 caracteres', 'a'.repeat(16)],
    ['512 caracteres', 'a'.repeat(512)],
    ['513 caracteres', 'a'.repeat(513)],
    ['com espaço', `${'a'.repeat(16)} b`],
    ['com acento', `${'a'.repeat(16)}é`],
    ['com DEL', `${'a'.repeat(16)}\x7F`],
    ['no limite do alfabeto', `${'!'.repeat(8)}${'~'.repeat(8)}`],
  ])('a chave %s: o painel e a API decidem igual', (_label, token) => {
    expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.test(token)).toBe(readApiTokenPattern().test(token))
  })

  test('o menor e o maior orçamento mensal são os da API', () => {
    expect(HOLIDAY_PROVIDER_BUDGET_MIN).toBe(
      readApiNumber(BUDGET_CONSTANTS, 'FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET'),
    )
    expect(HOLIDAY_PROVIDER_BUDGET_MAX).toBe(
      readApiNumber(BUDGET_CONSTANTS, 'FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET'),
    )
  })
})
