/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: o relógio do prazo de entrega é montado só em `main.ts`. Sem ele o repositório não
 * calcula prazo algum (nenhuma consulta, nenhum erro) — esquecer de repassá-lo apagaria o campo em
 * produção sem derrubar teste nenhum. No molde de `event-location-wiring.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const MAIN_TS_PATH = new URL('../../src/main.ts', import.meta.url)
const REPOSITORY_CALL = 'new DrizzleTripRepository(database, cargoLayoutLeaseOptions, {'
const MAX_ARGUMENT_LENGTH = 200

describe('fiação do prazo de entrega da nota em main.ts (spec 236 T1.2c)', () => {
  const source = readFileSync(MAIN_TS_PATH, 'utf8')
  const start = source.indexOf(REPOSITORY_CALL)
  const block = source.slice(start, start + MAX_ARGUMENT_LENGTH)

  test('o repositório de viagens existe uma vez só', () => {
    expect(start).toBeGreaterThan(-1)
    expect(source.indexOf(REPOSITORY_CALL, start + 1)).toBe(-1)
  })

  test('recebe o relógio, para o detalhe calcular o prazo', () => {
    expect(block).toContain('clock: businessCalendarClock')
  })

  test('e o logger, para o aviso do calendário recusado', () => {
    expect(block).toContain('logger,')
  })
})
