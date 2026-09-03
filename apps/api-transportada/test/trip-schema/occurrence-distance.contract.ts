/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0057 §3. ⚠️ Este contrato existe porque o campo chegou a ser **aceito e descartado**: a rota
 * parseava a distância, o tipo compilava, e o `insert` do repositório não a mencionava. Campo aceito
 * que não chega ao banco é pior que campo ausente — ninguém procura o dado que a API disse aceitar.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { tripStopOccurrences } from '../../src/database/trip.schema.js'

const REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-driver-field-report.repository.ts',
  import.meta.url,
).pathname

describe('a distância aferida da ocorrência', () => {
  test('é coluna da tabela, em metros inteiros', () => {
    expect(tripStopOccurrences.reportedDistanceMeters.name).toBe('reported_distance_meters')
    expect(tripStopOccurrences.reportedDistanceMeters.columnType).toBe('PgInteger')
  })

  /* Não aferida é um estado — parada sem coordenada, posição que nunca fixou. */
  test('aceita ausência: a coluna é anulável', () => {
    expect(tripStopOccurrences.reportedDistanceMeters.notNull).toBe(false)
  })

  test('o `insert` do repositório grava a distância', async () => {
    const source = await readFile(REPOSITORY, 'utf8')
    expect(source).toContain('reportedDistanceMeters: input.distanceMeters')
  })
})
