/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Preço efetivo do combustível: ajuste manual da empresa, quando existe, e senão a referência da ANP
 * da UF dela. A decisão é por produto — sobrescrever o diesel não move o etanol —, e a resposta
 * carrega os cinco produtos do catálogo mesmo sem preço nenhum, para a tela não ter de adivinhar
 * quais linhas faltam.
 */
import {
  FUEL_TYPES,
  FUEL_UNIT_BY_PRODUCT,
  type FuelProduct,
  type FuelUnit,
} from '../../shared/fuel.constant.js'

export type FuelPriceReference = {
  readonly pricePerUnit: string
  readonly state: string
  readonly weekEndingOn: string
}

export type FuelPriceReferenceRow = FuelPriceReference & {
  readonly product: FuelProduct
}

export type FuelPriceAdjustmentRow = {
  readonly pricePerUnit: string
  readonly product: FuelProduct
  readonly updatedAt: Date
}

export type FuelPriceFacts = {
  readonly adjustments: readonly FuelPriceAdjustmentRow[]
  readonly references: readonly FuelPriceReferenceRow[]
  readonly state: string
}

export type FuelPriceSource = 'anp' | 'manual'

export type EffectiveFuelPrice = {
  readonly effectivePricePerUnit: string | null
  readonly product: FuelProduct
  readonly reference: FuelPriceReference | null
  readonly source: FuelPriceSource | null
  readonly unit: FuelUnit
  readonly updatedAt: Date | null
}

export function resolveEffectiveFuelPrices(facts: FuelPriceFacts): readonly EffectiveFuelPrice[] {
  const adjustments = indexAdjustments(facts.adjustments)
  const references = indexReferences(facts.references, facts.state)

  return FUEL_TYPES.map(({ product, unit }) =>
    buildEntry({
      adjustment: adjustments.get(product),
      product,
      reference: references.get(product) ?? null,
      unit,
    }),
  )
}

/** O ajuste responde por um produto só: quem sobrescreveu o diesel lê de volta o diesel. */
export function resolveEffectiveFuelPrice(
  facts: FuelPriceFacts & { readonly product: FuelProduct },
): EffectiveFuelPrice {
  return buildEntry({
    adjustment: indexAdjustments(facts.adjustments).get(facts.product),
    product: facts.product,
    reference: indexReferences(facts.references, facts.state).get(facts.product) ?? null,
    unit: FUEL_UNIT_BY_PRODUCT[facts.product],
  })
}

type BuildEntryParams = {
  readonly adjustment: FuelPriceAdjustmentRow | undefined
  readonly product: FuelProduct
  readonly reference: FuelPriceReference | null
  readonly unit: FuelUnit
}

function buildEntry({
  adjustment,
  product,
  reference,
  unit,
}: BuildEntryParams): EffectiveFuelPrice {
  if (adjustment !== undefined) {
    return {
      effectivePricePerUnit: adjustment.pricePerUnit,
      product,
      reference,
      source: 'manual',
      unit,
      updatedAt: adjustment.updatedAt,
    }
  }

  if (reference !== null) {
    return {
      effectivePricePerUnit: reference.pricePerUnit,
      product,
      reference,
      source: 'anp',
      unit,
      updatedAt: null,
    }
  }

  return {
    effectivePricePerUnit: null,
    product,
    reference: null,
    source: null,
    unit,
    updatedAt: null,
  }
}

function indexAdjustments(
  adjustments: readonly FuelPriceAdjustmentRow[],
): ReadonlyMap<FuelProduct, FuelPriceAdjustmentRow> {
  return new Map(adjustments.map((adjustment) => [adjustment.product, adjustment]))
}

function indexReferences(
  references: readonly FuelPriceReferenceRow[],
  state: string,
): ReadonlyMap<FuelProduct, FuelPriceReference> {
  const latest = new Map<FuelProduct, FuelPriceReferenceRow>()

  for (const row of references) {
    if (row.state !== state) continue

    const current = latest.get(row.product)
    if (current === undefined || row.weekEndingOn > current.weekEndingOn) {
      latest.set(row.product, row)
    }
  }

  return new Map(
    [...latest].map(([product, row]) => [
      product,
      { pricePerUnit: row.pricePerUnit, state: row.state, weekEndingOn: row.weekEndingOn },
    ]),
  )
}
