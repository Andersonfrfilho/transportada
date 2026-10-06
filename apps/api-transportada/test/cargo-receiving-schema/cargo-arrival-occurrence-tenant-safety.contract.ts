/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as leituras e escritas da ocorrência de recebimento levam a empresa do contexto em
 * TODA junção e em todo filtro — um degrau sem `companyId` compila, passa em todo caminho feliz, e é
 * por ele que a avaria de uma empresa apareceria na tela de outra (OWASP API1/BOLA). Prova por texto
 * de fonte, como as outras leituras com várias junções; a integração prova o comportamento.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const SOURCES = [
  'cargo-arrival-occurrence-read.query.ts',
  'cargo-arrival-occurrence-lock.support.ts',
  'drizzle-cargo-arrival-occurrence.repository.ts',
  'drizzle-cargo-arrival-return.repository.ts',
  'cargo-preview-trip-draft.query.ts',
].map((file) => ({
  file,
  source: readFileSync(
    new URL(`../../src/cargo-receiving/infrastructure/${file}`, import.meta.url),
    'utf8',
  ),
}))

function joinsOf(source: string): readonly string[] {
  return [...source.split('.innerJoin(').slice(1), ...source.split('.leftJoin(').slice(1)].map(
    (join) => join.slice(0, join.indexOf('),')),
  )
}

describe('isolamento da ocorrência de recebimento (spec 237 T3.2)', () => {
  test('toda junção carrega a empresa', () => {
    const joins = SOURCES.flatMap(({ source }) => joinsOf(source)).filter(
      (join) => !join.startsWith('actorProfile'),
    )

    expect(joins.length).toBeGreaterThanOrEqual(6)
    for (const join of joins) expect(join).toInclude('ompanyId')
  })

  test('todo filtro carrega a empresa (ou o filtro da chegada, que a carrega)', () => {
    for (const { file, source } of SOURCES) {
      const wheres = source.split('.where(').slice(1)
      expect(wheres.length, file).toBeGreaterThan(0)
      for (const where of wheres) {
        expect(
          /companyId|build(Arrival|Preview)\w*Filters|occurrenceConditions/u.test(
            where.slice(0, 240),
          ),
          file,
        ).toBeTrue()
      }
    }
  })
})
