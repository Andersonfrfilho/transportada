/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 10): `toRow`/`toAdjustment` liam `adjustmentActorUserId` e
 * `adjustmentObservedOn` como o marcador de "sem ajuste" (`null` nos dois), mas cravavam
 * `row.adjustmentUpdatedAt as Date` sem checar o terceiro campo do mesmo jeito — lavando nulidade
 * (`standards/typescript.md`) em vez de tornar o invariante explícito ("os três são gravados
 * juntos, na mesma linha de ajuste"). Uma linha de join inconsistente (actor e data presentes, mas
 * `updatedAt` nulo — não deveria existir de verdade, mas o tipo do banco permite) produzia um
 * `TollBoothChargeAdjustmentRow.updatedAt` que é `null` em tempo de execução apesar do tipo dizer
 * `Date` — quem chamar `.toISOString()` nele quebra sem aviso do compilador.
 */
import { describe, expect, test } from 'bun:test'

import {
  toRow,
  type CatalogJoinRow,
} from '../../src/toll-booths/infrastructure/toll-booth-catalog-row.mapper.js'

function buildJoinRow(overrides: Partial<CatalogJoinRow> = {}): CatalogJoinRow {
  return {
    adjustmentActorUserId: null,
    adjustmentChargeCar: null,
    adjustmentChargePerAxle: null,
    adjustmentChargePerAxleAutomatic: null,
    adjustmentObservedOn: null,
    adjustmentUpdatedAt: null,
    catalogChargeCar: null,
    catalogChargePerAxle: '12.3400',
    catalogChargePerAxleAutomatic: null,
    catalogName: 'Praça X',
    catalogObservedOn: '2026-01-01',
    catalogOperator: 'Operadora Y',
    osmNodeId: 123n,
    ...overrides,
  }
}

describe('toll-booth-catalog-row.mapper (spec 154 T503, defeito 10)', () => {
  test('ajuste completo (actor, data e atualização) vira TollBoothChargeAdjustmentRow', () => {
    const updatedAt = new Date('2026-02-01T00:00:00.000Z')
    const row = buildJoinRow({
      adjustmentActorUserId: 'user-1',
      adjustmentChargeCar: '10.0000',
      adjustmentObservedOn: '2026-02-01',
      adjustmentUpdatedAt: updatedAt,
    })

    const mapped = toRow(row, new Set())

    expect(mapped.adjustment).toEqual({
      actorUserId: 'user-1',
      chargeCar: '10.0000',
      chargePerAxle: null,
      chargePerAxleAutomatic: null,
      observedOn: '2026-02-01',
      osmNodeId: 123,
      updatedAt,
    })
  })

  test('join sem correspondência (os três nulos) não vira ajuste', () => {
    const mapped = toRow(buildJoinRow(), new Set())

    expect(mapped.adjustment).toBeNull()
  })

  test('linha inconsistente (actor e data presentes, updatedAt nulo) não vira um ajuste com Date falso', () => {
    const row = buildJoinRow({
      adjustmentActorUserId: 'user-1',
      adjustmentObservedOn: '2026-02-01',
      adjustmentUpdatedAt: null,
    })

    const mapped = toRow(row, new Set())

    // O guard trata a inconsistência como "sem ajuste" em vez de devolver `updatedAt: null`
    // fingindo ser `Date` — nunca um objeto com um campo mentindo sobre o próprio tipo.
    expect(mapped.adjustment).toBeNull()
  })
})
