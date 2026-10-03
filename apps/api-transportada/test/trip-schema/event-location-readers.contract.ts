/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF12/D7 da spec 196. A lista fechada de leitores vive em
 * `src/trips/application/event-location-readers.constant.ts`; aqui ela é cobrada contra o texto de
 * `src/`. A varredura é por **tabela qualificada** (`tripStopEvents.latitude`) de propósito: a
 * palavra `latitude` solta aparece em geocodificação, pedágio e endereço, que não têm nada a ver com
 * posição de evento, e um recorte mais largo viraria ruído que ninguém lê.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  EVENT_LOCATION_FORBIDDEN_RESPONSES,
  EVENT_LOCATION_POSITION_COLUMNS,
  EVENT_LOCATION_READERS,
  EVENT_LOCATION_TABLE_IDENTIFIERS,
} from '../../src/trips/application/event-location-readers.constant.js'

const SOURCE_ROOT = new URL('../../src', import.meta.url).pathname

/** O próprio arquivo da lista cita caminhos e nomes de coluna — não é leitor. */
const SWEEP_EXEMPT_PATHS = ['trips/application/event-location-readers.constant.ts']

const BARE_SELECT_PATTERN = /\.(select|selectDistinct)\(\s*\)/
const ROW_SPREAD_PATTERN = /\.\.\.(?!new\b)[a-zA-Z_$][\w$]*\s*[,}]/

type PositionReference = {
  readonly column: string
  readonly path: string
  readonly table: string
}

function listSourceFiles(directory: string): readonly string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (entry.endsWith('.ts')) files.push(fullPath)
  }

  return files
}

function collectPositionReferences(path: string, content: string): readonly PositionReference[] {
  const references: PositionReference[] = []

  for (const table of EVENT_LOCATION_TABLE_IDENTIFIERS) {
    for (const column of EVENT_LOCATION_POSITION_COLUMNS) {
      const pattern = new RegExp(`\\b${table}\\s*\\.\\s*${column}\\b`)
      if (pattern.test(content)) references.push({ column, path, table })
    }
  }

  return references
}

const sourceFiles = listSourceFiles(SOURCE_ROOT).map((fullPath) => ({
  content: readFileSync(fullPath, 'utf8'),
  path: relative(SOURCE_ROOT, fullPath).split('\\').join('/'),
}))

const references = sourceFiles
  .filter((file) => !SWEEP_EXEMPT_PATHS.includes(file.path))
  .flatMap((file) => collectPositionReferences(file.path, file.content))

const allowedColumnsByPath = new Map(
  EVENT_LOCATION_READERS.map((reader) => [reader.path, new Set<string>(reader.columns)]),
)

describe('lista fechada de leitores da posição do evento (196 RF12/D7)', () => {
  test('nenhum arquivo fora da lista referencia coluna de posição das cinco tabelas', () => {
    const offenders = references
      .filter((reference) => !allowedColumnsByPath.has(reference.path))
      .map((reference) => `${reference.path} -> ${reference.table}.${reference.column}`)
      .toSorted((left, right) => left.localeCompare(right))

    expect(offenders).toEqual([])
  })

  test('leitor da lista só referencia as colunas que a lista lhe deu', () => {
    const offenders = references
      .filter((reference) => {
        const allowed = allowedColumnsByPath.get(reference.path)
        return allowed !== undefined && !allowed.has(reference.column)
      })
      .map((reference) => `${reference.path} -> ${reference.table}.${reference.column}`)
      .toSorted((left, right) => left.localeCompare(right))

    expect(offenders).toEqual([])
  })

  test('a lista não tem caminho morto nem repetido', () => {
    const knownPaths = new Set(sourceFiles.map((file) => file.path))
    const listedPaths = EVENT_LOCATION_READERS.map((reader) => reader.path)

    expect(listedPaths.filter((path) => !knownPaths.has(path))).toEqual([])
    expect(listedPaths.length).toBe(new Set(listedPaths).size)
  })

  test('todo leitor declara pelo menos uma coluna e um motivo', () => {
    const incomplete = EVENT_LOCATION_READERS.filter(
      (reader) => reader.columns.length === 0 || reader.reason.trim() === '',
    ).map((reader) => reader.path)

    expect(incomplete).toEqual([])
  })
})

describe('respostas que não podem carregar posição de evento (196 RF12)', () => {
  const forbidden = EVENT_LOCATION_FORBIDDEN_RESPONSES.map((entry) => {
    const file = sourceFiles.find((candidate) => candidate.path === entry.path)
    return { ...entry, content: file?.content }
  })

  test('todo caminho da lista negativa existe', () => {
    expect(
      forbidden.filter((entry) => entry.content === undefined).map((entry) => entry.path),
    ).toEqual([])
  })

  test('nenhuma delas referencia coluna de posição das cinco tabelas', () => {
    const offenders = forbidden
      .flatMap((entry) =>
        entry.content === undefined ? [] : collectPositionReferences(entry.path, entry.content),
      )
      .map((reference) => `${reference.path} -> ${reference.table}.${reference.column}`)
      .toSorted((left, right) => left.localeCompare(right))

    expect(offenders).toEqual([])
  })

  test('nenhuma delas usa `select()` sem projeção', () => {
    const offenders = forbidden
      .filter((entry) => entry.content !== undefined && BARE_SELECT_PATTERN.test(entry.content))
      .map((entry) => entry.path)

    expect(offenders).toEqual([])
  })

  test('nenhuma delas espalha a linha do banco na resposta', () => {
    const offenders = forbidden
      .filter((entry) => entry.content !== undefined && ROW_SPREAD_PATTERN.test(entry.content))
      .map((entry) => entry.path)

    expect(offenders).toEqual([])
  })
})

/**
 * A varredura por coluna qualificada não vê o que devolve a linha inteira sem citar coluna nenhuma:
 * `select()` cru, `returning()` cru, `getTableColumns`, `alias` e a API relacional. Fora da lista de
 * leitores, um arquivo que toca as cinco tabelas não pode usar nenhuma dessas formas.
 */
describe('formas que devolvem a linha inteira das cinco tabelas fora da lista (196 RF12)', () => {
  const tableAlternation = EVENT_LOCATION_TABLE_IDENTIFIERS.join('|')
  const GETTABLECOLUMNS_PATTERN = new RegExp(`getTableColumns\\(\\s*(${tableAlternation})\\b`)
  const RELATIONAL_QUERY_PATTERN = new RegExp(`\\.query\\.(${tableAlternation})\\b`)
  const ALIAS_DECLARATION_PATTERN = new RegExp(
    `\\b(?:const|let)\\s+([\\w$]+)\\s*=\\s*alias\\(\\s*(?:${tableAlternation})\\b`,
    'g',
  )
  const POSITION_COLUMN_ALTERNATION = EVENT_LOCATION_POSITION_COLUMNS.join('|')
  const TOUCH_PATTERN = new RegExp(`\\b(${tableAlternation})\\b`)
  const BARE_RETURNING_PATTERN = /\.returning\(\s*\)/

  const outsideTheList = sourceFiles.filter(
    (file) =>
      !SWEEP_EXEMPT_PATHS.includes(file.path) &&
      !allowedColumnsByPath.has(file.path) &&
      !file.path.startsWith('database/'),
  )

  test('o recorte não está vazio: há arquivos fora da lista que tocam as tabelas', () => {
    expect(
      outsideTheList.filter((file) => TOUCH_PATTERN.test(file.content)).length,
    ).toBeGreaterThan(0)
  })

  test('nenhum arquivo fora da lista usa getTableColumns ou a API relacional nelas', () => {
    const offenders = outsideTheList
      .filter(
        (file) =>
          GETTABLECOLUMNS_PATTERN.test(file.content) || RELATIONAL_QUERY_PATTERN.test(file.content),
      )
      .map((file) => file.path)
      .toSorted((left, right) => left.localeCompare(right))

    expect(offenders).toEqual([])
  })

  /** `alias` é legítimo (o portal o usa só para juntar por id); o que reprova é ler posição por ele. */
  test('apelido de uma das cinco tabelas, fora da lista, nunca lê coluna de posição', () => {
    const offenders: string[] = []
    for (const file of outsideTheList) {
      for (const match of file.content.matchAll(ALIAS_DECLARATION_PATTERN)) {
        const aliasName = match[1] ?? ''
        const positionPattern = new RegExp(
          `\\b${aliasName.replaceAll('$', '\\$')}\\s*\\.\\s*(${POSITION_COLUMN_ALTERNATION})\\b`,
        )
        if (positionPattern.test(file.content)) offenders.push(`${file.path} -> ${aliasName}`)
      }
    }

    expect(offenders).toEqual([])
  })

  test('o detector de apelido enxerga a declaração real do portal', () => {
    const portal = sourceFiles.find(
      (file) => file.path === 'contractor-portal/infrastructure/contractor-occurrence.query.ts',
    )

    expect([...(portal?.content.matchAll(ALIAS_DECLARATION_PATTERN) ?? [])].length).toBeGreaterThan(
      0,
    )
  })

  test('nenhum arquivo fora da lista que toca as tabelas usa `select()` ou `returning()` crus', () => {
    const offenders = outsideTheList
      .filter(
        (file) =>
          TOUCH_PATTERN.test(file.content) &&
          (BARE_SELECT_PATTERN.test(file.content) || BARE_RETURNING_PATTERN.test(file.content)),
      )
      .map((file) => file.path)
      .toSorted((left, right) => left.localeCompare(right))

    expect(offenders).toEqual([])
  })
})
