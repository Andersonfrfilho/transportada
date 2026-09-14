/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { CargoLayoutTimeoutError } from '../../src/cargo-layout/application/cargo-layout-timeout.error.js'
import { computeCargoLayout } from '../../src/cargo-layout/infrastructure/cargo-layout.worker.js'
import { createThreadedCargoLayoutGateway } from '../../src/cargo-layout/infrastructure/threaded-cargo-layout.gateway.js'
import { buildStoredCargoLayoutInput } from '../fixtures/cargo-layout-input.fixture.js'

describe('cálculo da planta em thread (spec 145 D9)', () => {
  /** O caminho `new Worker(url)` de verdade: é ele que quebra se o arquivo da thread não existir. */
  test('a thread devolve a planta, e ela sobrevive ao jsonb', async () => {
    const gateway = createThreadedCargoLayoutGateway()
    const input = buildStoredCargoLayoutInput({ stopCount: 3 })

    const layout = await gateway.compute({ budgetMs: 60_000, input })

    expect(layout).not.toBeNull()
    expect(layout?.placement?.layers.length).toBeGreaterThan(0)
    expect(layout?.placement?.unplaced.some((box) => box.reason === 'time_budget')).toBe(false)
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout)
  })

  /**
   * ⚠️ O tipo do pacote promete `| null`, mas a versão instalada nunca o devolve: sem baú nem
   * capacidade sai uma planta sem arranjo. O ramo `null → CARGO_LAYOUT_UNAVAILABLE` (D15) fica coberto
   * pelo contrato do handler; este fixa o que a thread devolve hoje, para a mudança não passar calada.
   */
  test('sem baú nem capacidade a thread devolve planta sem arranjo', async () => {
    const gateway = createThreadedCargoLayoutGateway()
    const input = {
      ...buildStoredCargoLayoutInput({ stopCount: 1 }),
      bedDimensions: null,
      capacityM3: null,
    }

    const layout = await gateway.compute({ budgetMs: 60_000, input })

    expect(layout?.placement).toBeNull()
    expect(layout?.bedLengthM).toBeNull()
  })

  test('thread que não responde dentro do teto é terminada com erro de tempo', async () => {
    const gateway = createThreadedCargoLayoutGateway({ ceilingMarginMs: 0 })
    const input = buildStoredCargoLayoutInput({ stopCount: 3 })

    await expect(gateway.compute({ budgetMs: 0, input })).rejects.toBeInstanceOf(
      CargoLayoutTimeoutError,
    )
  })

  /** D23: o baú fechado decide o encosto da pilha alta — a thread não pode descartá-lo. */
  test('a thread repassa enclosedBody ao empacotador', () => {
    const source = readFileSync(
      new URL('../../src/cargo-layout/infrastructure/cargo-layout.worker.ts', import.meta.url),
      'utf8',
    )
    const call = source.slice(source.indexOf('resolveCargoLayout({'))

    expect(call).toMatch(/^resolveCargoLayout\(\{[^}]*\benclosedBody,/)
  })

  /** D24: o alcance decide o que cabe — a thread repassa, e ausente fica ausente (padrão do pacote). */
  test('a thread repassa deliveryReachM ao empacotador só quando presente', () => {
    const source = readFileSync(
      new URL('../../src/cargo-layout/infrastructure/cargo-layout.worker.ts', import.meta.url),
      'utf8',
    )
    const call = source.slice(source.indexOf('resolveCargoLayout({'))

    expect(call).toMatch(
      /^resolveCargoLayout\(\{[\s\S]*\.\.\.\(deliveryReachM === undefined \? \{\} : \{ deliveryReachM \}\)/,
    )
  })

  /** O prazo nasce dentro da thread: é o relógio dela que conta, não o da fila. */
  test('prazo vencido devolve as caixas como time_budget, nunca as some', () => {
    let tick = 0
    const layout = computeCargoLayout({
      budgetMs: 10,
      input: buildStoredCargoLayoutInput({ stopCount: 3 }),
      now: () => (tick += 1_000),
    })

    expect(layout?.placement?.unplaced.some((box) => box.reason === 'time_budget')).toBe(true)
  })
})
