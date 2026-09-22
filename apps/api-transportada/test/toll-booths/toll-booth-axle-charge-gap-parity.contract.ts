/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 8): `countBoothsWithoutKnownAxleCharge`
 * (`toll-booth-axle-charge-gap.policy.ts`) reimplementa a precedência
 * `adjustment?.chargePerAxle ?? catalog.chargePerAxle` — a mesma que `resolveEffectiveTollBoothCharge`
 * (spec 086, `companies/domain/toll-booth-charge.policy.ts`) já define para o campo
 * `effectiveChargePerAxle`. As duas funções não compartilham código (a contagem só tem as colunas
 * mínimas — RNF2/T202b — nunca a praça inteira que `resolveEffectiveTollBoothCharge` resolve), então
 * nada barra as duas divergindo em silêncio se uma mudar sem a outra. Este contrato, no molde de
 * `list-toll-booth-charges-catalog-parity.contract.ts` (T203), prova que concordam praça a praça:
 * uma praça só some da contagem de "sem tarifa por eixo conhecida" se, e só se,
 * `resolveEffectiveTollBoothCharge` também considera `effectiveChargePerAxle` conhecido para ela.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEffectiveTollBoothCharge,
  type TollBoothCatalogEntry,
  type TollBoothChargeAdjustmentRow,
} from '../../src/companies/domain/toll-booth-charge.policy.js'
import {
  countBoothsWithoutKnownAxleCharge,
  type TollBoothAxleChargeAdjustmentRow,
  type TollBoothAxleChargeCatalogRow,
} from '../../src/toll-booths/domain/toll-booth-axle-charge-gap.policy.js'

function catalogEntry(
  overrides: Partial<TollBoothCatalogEntry> & { osmNodeId: number },
): TollBoothCatalogEntry {
  return {
    chargeCar: '10.0000',
    chargePerAxle: null,
    chargePerAxleAutomatic: null,
    name: `Praça ${overrides.osmNodeId}`,
    observedOn: '2026-06-01',
    operator: 'CCR',
    ...overrides,
  }
}

function adjustmentRow(
  overrides: Partial<TollBoothChargeAdjustmentRow> & { osmNodeId: number },
): TollBoothChargeAdjustmentRow {
  return {
    actorUserId: 'user-1',
    chargeCar: null,
    chargePerAxle: null,
    chargePerAxleAutomatic: null,
    observedOn: '2026-09-07',
    updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    ...overrides,
  }
}

describe('a contagem de "sem tarifa por eixo conhecida" concorda com resolveEffectiveTollBoothCharge (spec 154 T503, defeito 8)', () => {
  test('praça a praça: contada como "sem tarifa" se, e só se, effectiveChargePerAxle é nulo', () => {
    const catalog: readonly TollBoothCatalogEntry[] = [
      catalogEntry({ chargePerAxle: null, osmNodeId: 1 }), // catálogo sem tarifa, sem ajuste
      catalogEntry({ chargePerAxle: '10.0000', osmNodeId: 2 }), // catálogo com tarifa, sem ajuste
      catalogEntry({ chargePerAxle: null, osmNodeId: 3 }), // catálogo sem tarifa, ajuste corrige
      catalogEntry({ chargePerAxle: '10.0000', osmNodeId: 4 }), // catálogo com tarifa, ajuste zera para nulo é impossível — ajuste isento (0.00) continua conhecida
    ]
    const adjustments = new Map<number, TollBoothChargeAdjustmentRow>([
      [3, adjustmentRow({ chargePerAxle: '8.0000', osmNodeId: 3 })],
      [4, adjustmentRow({ chargePerAxle: '0.0000', osmNodeId: 4 })],
    ])

    const axleCatalogRows: readonly TollBoothAxleChargeCatalogRow[] = catalog.map((entry) => ({
      chargePerAxle: entry.chargePerAxle,
      osmNodeId: entry.osmNodeId,
    }))
    const axleAdjustmentRows: readonly TollBoothAxleChargeAdjustmentRow[] = [
      ...adjustments.values(),
    ].map((adjustment) => ({
      chargePerAxle: adjustment.chargePerAxle,
      osmNodeId: adjustment.osmNodeId,
    }))

    const withoutKnownAxleCharge = countBoothsWithoutKnownAxleCharge({
      adjustments: axleAdjustmentRows,
      catalog: axleCatalogRows,
    })

    const effectiveByNodeId = new Map(
      catalog.map((entry) => [
        entry.osmNodeId,
        resolveEffectiveTollBoothCharge({
          adjustment: adjustments.get(entry.osmNodeId) ?? null,
          catalog: entry,
        }),
      ]),
    )

    const expectedWithoutKnownAxleCharge = [...effectiveByNodeId.values()].filter(
      (effective) => effective.effectiveChargePerAxle === null,
    ).length

    expect(withoutKnownAxleCharge).toBe(expectedWithoutKnownAxleCharge)
    expect(withoutKnownAxleCharge).toBe(1) // só a praça 1 continua sem tarifa por eixo conhecida
    expect(effectiveByNodeId.get(1)?.effectiveChargePerAxle).toBeNull()
    expect(effectiveByNodeId.get(3)?.effectiveChargePerAxle).toBe('8.0000')
    expect(effectiveByNodeId.get(4)?.effectiveChargePerAxle).toBe('0.0000')
  })
})
