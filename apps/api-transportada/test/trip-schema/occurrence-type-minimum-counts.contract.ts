/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.1 (RF1c, RF1c2, D-a): a quantidade mínima de fotos e de produtos vira dado. No tipo,
 * `photo_minimum_count` nasce 1 e nunca é nula; `items_minimum_count` é nula (= todos os itens da
 * nota) e só vale com `items_mode = 'required'`. Nas duas exceções as três colunas são nulas e sem
 * padrão — nulo herda do tipo, e `items_mode` + `items_minimum_count` vão como par.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
} from '../../src/database/database.schema.js'

const POSTGRES_IDENTIFIER_LIMIT = 63
const ITEMS_MODE = 'items_mode'
const PHOTO_MINIMUM_COUNT = 'photo_minimum_count'
const ITEMS_MINIMUM_COUNT = 'items_minimum_count'

type SchemaTable = Parameters<typeof getTableConfig>[0]

function describeColumn(table: SchemaTable, name: string) {
  const column = getTableConfig(table).columns.find((candidate) => candidate.name === name)
  if (column === undefined) return undefined
  return { default: column.default, notNull: column.notNull }
}

function checkNames(table: SchemaTable): readonly string[] {
  return getTableConfig(table).checks.map((check) => check.name)
}

describe('quantidade mínima no tipo de ocorrência (spec 246 T1c.1)', () => {
  test('foto nasce com mínimo 1, nunca nulo; produtos nulo = todos os itens', () => {
    expect(describeColumn(companyOccurrenceTypes, PHOTO_MINIMUM_COUNT)).toEqual({
      default: 1,
      notNull: true,
    })
    expect(describeColumn(companyOccurrenceTypes, ITEMS_MINIMUM_COUNT)).toEqual({
      default: undefined,
      notNull: false,
    })
  })

  test('as três CHECKs do mínimo existem, nomeadas', () => {
    expect(checkNames(companyOccurrenceTypes)).toEqual(
      expect.arrayContaining([
        'company_occurrence_types_photo_minimum_count_check',
        'company_occurrence_types_items_minimum_count_check',
        'company_occurrence_types_items_minimum_shape_check',
      ]),
    )
  })

  test('as CHECKs da 241 seguem no tipo', () => {
    expect(checkNames(companyOccurrenceTypes)).toEqual(
      expect.arrayContaining([
        'company_occurrence_types_items_mode_check',
        'company_occurrence_types_items_off_shape_check',
      ]),
    )
  })
})

for (const table of [
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
]) {
  const tableName = getTableConfig(table).name

  describe(`${tableName} herda o par de produtos e a quantidade de fotos (spec 246 T1c.1, D-a)`, () => {
    test('as três colunas são nulas e sem padrão', () => {
      for (const column of [ITEMS_MODE, PHOTO_MINIMUM_COUNT, ITEMS_MINIMUM_COUNT]) {
        expect(describeColumn(table, column)).toEqual({ default: undefined, notNull: false })
      }
    })

    test('as CHECKs novas cabem em 63 caracteres e não repetem a forma `off` da 241', () => {
      const names = checkNames(table).filter(
        (name) =>
          name.includes(ITEMS_MODE) ||
          name.includes(PHOTO_MINIMUM_COUNT) ||
          name.includes(ITEMS_MINIMUM_COUNT) ||
          name.includes('items_minimum'),
      )
      expect(names).toHaveLength(4)
      for (const name of names) expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_LIMIT)
      expect(names.some((name) => name.includes('off_shape'))).toBe(false)
    })
  })
}
