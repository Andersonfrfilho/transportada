/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveEtaShiftMilliseconds } from '../../src/trips/domain/eta-anchor.policy.js'

const PLANNED = new Date('2026-09-10T11:00:00.000Z')

describe('a âncora do ETA (spec 109 D2/D3)', () => {
  /** Saiu 1h30 depois do previsto: toda parada anda 1h30. */
  it('desloca pelo atraso da saída', () => {
    expect(
      resolveEtaShiftMilliseconds({
        plannedAt: PLANNED,
        reportedAt: new Date('2026-09-10T12:30:00.000Z'),
      }),
    ).toBe(90 * 60 * 1_000)
  })

  /** Saiu adiantado: o deslocamento é negativo, e é o certo — as entregas chegam antes. */
  it('desloca para trás quando a saída é adiantada', () => {
    expect(
      resolveEtaShiftMilliseconds({
        plannedAt: PLANNED,
        reportedAt: new Date('2026-09-10T10:30:00.000Z'),
      }),
    ).toBe(-30 * 60 * 1_000)
  })

  /**
   * ⚠️ Viagem sem âncora — planejada antes desta spec, ou montada à mão — **não desloca**. Deslocar
   * por uma âncora inventada erraria mais que não deslocar.
   */
  it('sem âncora não desloca', () => {
    expect(resolveEtaShiftMilliseconds({ plannedAt: null, reportedAt: new Date() })).toBe(0)
  })

  /**
   * ⚠️ A mesma conta serve à chegada: o previsto é o ETA da parada, o real é o "cheguei". Duas
   * definições de atraso divergiriam no primeiro caso de borda.
   */
  it('serve à chegada com a mesma conta', () => {
    expect(
      resolveEtaShiftMilliseconds({
        plannedAt: new Date('2026-09-10T14:00:00.000Z'),
        reportedAt: new Date('2026-09-10T14:40:00.000Z'),
      }),
    ).toBe(40 * 60 * 1_000)
  })

  /**
   * ⚠️ Despachar duas vezes não pode deslocar duas vezes. Quem garante isso é o despacho reescrever
   * a âncora com a saída real: a segunda diferença é zero por construção.
   */
  it('reancorado na saída, o segundo despacho não move nada', () => {
    const departedAt = new Date('2026-09-10T12:30:00.000Z')
    const shifted = resolveEtaShiftMilliseconds({ plannedAt: PLANNED, reportedAt: departedAt })
    expect(shifted).toBeGreaterThan(0)

    expect(resolveEtaShiftMilliseconds({ plannedAt: departedAt, reportedAt: departedAt })).toBe(0)
  })
})
