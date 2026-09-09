/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveEtaShiftMilliseconds } from '../../src/trips/domain/eta-anchor.policy.js'

const PLANNED = new Date('2026-09-10T11:00:00.000Z')

describe('a âncora do ETA (spec 109 D2)', () => {
  /** Saiu 1h30 depois do previsto: toda parada anda 1h30. */
  it('desloca pelo atraso da saída', () => {
    expect(
      resolveEtaShiftMilliseconds({
        anchoredDepartureAt: PLANNED,
        departedAt: new Date('2026-09-10T12:30:00.000Z'),
      }),
    ).toBe(90 * 60 * 1_000)
  })

  /** Saiu adiantado: o deslocamento é negativo, e é o certo — as entregas chegam antes. */
  it('desloca para trás quando a saída é adiantada', () => {
    expect(
      resolveEtaShiftMilliseconds({
        anchoredDepartureAt: PLANNED,
        departedAt: new Date('2026-09-10T10:30:00.000Z'),
      }),
    ).toBe(-30 * 60 * 1_000)
  })

  /**
   * ⚠️ Viagem sem âncora — planejada antes desta spec, ou montada à mão — **não desloca**. Deslocar
   * por uma âncora inventada erraria mais que não deslocar.
   */
  it('sem âncora não desloca', () => {
    expect(resolveEtaShiftMilliseconds({ anchoredDepartureAt: null, departedAt: new Date() })).toBe(
      0,
    )
  })

  /**
   * ⚠️ Despachar duas vezes não pode deslocar duas vezes. Quem garante isso é o despacho reescrever
   * a âncora com a saída real: a segunda diferença é zero por construção.
   */
  it('reancorado na saída, o segundo despacho não move nada', () => {
    const departedAt = new Date('2026-09-10T12:30:00.000Z')
    const shifted = resolveEtaShiftMilliseconds({ anchoredDepartureAt: PLANNED, departedAt })
    expect(shifted).toBeGreaterThan(0)

    expect(resolveEtaShiftMilliseconds({ anchoredDepartureAt: departedAt, departedAt })).toBe(0)
  })
})
