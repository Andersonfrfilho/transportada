/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor. O vocabulário do cache do fornecedor viaja para CHECK do banco, e a migration só
 * roda na API: o worker que grava `scope = 'state'` onde o banco só aceita `'estado'` falha em produção,
 * dentro de um ciclo diário que ninguém está olhando.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { CITY_IBGE_CODE_PATTERN } from '../../src/holiday-provider-pull/domain/holiday-provider.constant.js'

const WORKER_CONSTANTS = new URL(
  '../../src/holiday-provider-pull/domain/holiday-provider.constant.ts',
  import.meta.url,
)
const API_CONSTANTS = new URL(
  '../../../api-transportada/src/shared/holiday-provider.constant.ts',
  import.meta.url,
)
const WORKER_STATES = new URL(
  '../../src/holiday-provider-pull/domain/brazilian-state.constant.ts',
  import.meta.url,
)
const API_CALENDAR_CONSTANTS = new URL(
  '../../../api-transportada/src/shared/business-calendar.constant.ts',
  import.meta.url,
)

/** O texto da declaração: até o `as const`, ou a própria linha quando ela se fecha sozinha. */
function extractDeclaration(input: { readonly name: string; readonly source: string }): string {
  const start = input.source.indexOf(`export const ${input.name}`)
  if (start === -1) throw new Error(`${input.name} not found`)

  const lineEnd = input.source.indexOf('\n', start)
  const firstLine = input.source.slice(start, lineEnd).trim()
  if (!firstLine.endsWith('[') && !firstLine.endsWith('{')) return firstLine

  const end = input.source.indexOf('as const', start)
  return input.source.slice(start, end + 'as const'.length)
}

const SHARED_DECLARATIONS = [
  'HOLIDAY_PROVIDER_NATIONAL_CODE',
  'HOLIDAY_PROVIDER_SCOPE',
  'HOLIDAY_PROVIDER_FETCH_STATUS',
  'HOLIDAY_PROVIDER_TYPE',
  'HOLIDAY_PROVIDER_TYPES',
  'HOLIDAY_IMPORT_SUPPRESSION_SCOPES',
] as const

describe('o vocabulário do cache do fornecedor é o da API (spec 252 T3.2)', () => {
  test('cada declaração do worker é idêntica à da API', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_CONSTANTS, 'utf8'),
      readFile(API_CONSTANTS, 'utf8'),
    ])

    for (const name of SHARED_DECLARATIONS) {
      expect(extractDeclaration({ name, source: worker })).toBe(
        extractDeclaration({ name, source: api }),
      )
    }
  })

  test('a lista das 27 UFs e o teto do nome são os do calendário da API', async () => {
    const [worker, workerStates, api] = await Promise.all([
      readFile(WORKER_CONSTANTS, 'utf8'),
      readFile(WORKER_STATES, 'utf8'),
      readFile(API_CALENDAR_CONSTANTS, 'utf8'),
    ])

    expect(
      extractDeclaration({ name: 'BRAZILIAN_STATE_IBGE_CODE_LIST', source: workerStates }),
    ).toBe(extractDeclaration({ name: 'BRAZILIAN_STATE_IBGE_CODE_LIST', source: api }))
    expect(extractDeclaration({ name: 'HOLIDAY_NAME_MAX_LENGTH', source: worker })).toBe(
      extractDeclaration({ name: 'HOLIDAY_NAME_MAX_LENGTH', source: api }),
    )
  })

  test('o padrão do código de cidade é o do CHECK do banco', async () => {
    const api = await readFile(API_CALENDAR_CONSTANTS, 'utf8')

    expect(api).toContain(`export const CITY_IBGE_CODE_SOURCE = '${CITY_IBGE_CODE_PATTERN.source}'`)
  })
})
