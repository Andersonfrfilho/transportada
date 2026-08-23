/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Preço efetivo do combustível: ajuste manual da empresa, quando existe, e senão a referência
 * pública. A decisão é por produto — sobrescrever o diesel não move o etanol —, e a resposta carrega
 * os seis produtos do catálogo mesmo sem preço nenhum, para a tela não ter de adivinhar quais linhas
 * faltam.
 *
 * A referência pública tem duas origens, e elas não são intercambiáveis: os cinco combustíveis
 * líquidos e o GNV vêm da planilha semanal da ANP, casada pela UF da empresa, e a energia vem da
 * tarifa homologada da ANEEL, casada pela distribuidora que a empresa escolheu. Por isso a energia
 * entra como fato próprio, e não como mais uma linha de `references`: ela não tem UF nem semana.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { KILOWATT_HOURS_PER_MEGAWATT_HOUR } from '../../shared/energy-tariff.constant.js'
import {
  ELECTRIC_FUEL_PRODUCT,
  FUEL_TYPES,
  FUEL_UNIT_BY_PRODUCT,
  type FuelProduct,
  type FuelUnit,
} from '../../shared/fuel.constant.js'

const MONEY_FACTOR = 10n ** MONEY_SCALE
const DECIMAL_ERROR_PREFIX = 'FUEL_PRICE'

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

/**
 * A tarifa como a ANEEL publica — as duas parcelas em R$/MWh, secas — mais o fator que a empresa
 * declarou. O fator viaja junto porque ele é o que separa o que foi homologado do que a conta cobra,
 * e guardar o produto dos dois já resolvido seria uma segunda verdade sobre o mesmo número.
 */
export type EnergyTariff = {
  readonly adjustmentFactor: string
  readonly distributorCode: string
  readonly effectiveFrom: string
  readonly effectiveTo: string
  readonly tePerMegawattHour: string
  readonly tusdPerMegawattHour: string
}

export type FuelPriceFacts = {
  readonly adjustments: readonly FuelPriceAdjustmentRow[]
  readonly energy: EnergyTariff | null
  readonly references: readonly FuelPriceReferenceRow[]
  readonly state: string
}

export type FuelPriceSource = 'aneel' | 'anp' | 'manual'

export type EffectiveFuelPrice = {
  readonly effectivePricePerUnit: string | null
  readonly product: FuelProduct
  readonly reference: FuelPriceReference | null
  readonly source: FuelPriceSource | null
  readonly tariff: EnergyTariff | null
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
      tariff: energyTariffOf({ facts, product }),
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
    tariff: energyTariffOf({ facts, product: facts.product }),
    unit: FUEL_UNIT_BY_PRODUCT[facts.product],
  })
}

type BuildEntryParams = {
  readonly adjustment: FuelPriceAdjustmentRow | undefined
  readonly product: FuelProduct
  readonly reference: FuelPriceReference | null
  readonly tariff: EnergyTariff | null
  readonly unit: FuelUnit
}

function buildEntry({
  adjustment,
  product,
  reference,
  tariff,
  unit,
}: BuildEntryParams): EffectiveFuelPrice {
  if (adjustment !== undefined) {
    return {
      effectivePricePerUnit: adjustment.pricePerUnit,
      product,
      reference,
      source: 'manual',
      tariff,
      unit,
      updatedAt: adjustment.updatedAt,
    }
  }

  if (tariff !== null) {
    return {
      effectivePricePerUnit: resolveKilowattHourPrice(tariff),
      product,
      reference,
      source: 'aneel',
      tariff,
      unit,
      updatedAt: null,
    }
  }

  if (reference !== null) {
    return {
      effectivePricePerUnit: reference.pricePerUnit,
      product,
      reference,
      source: 'anp',
      tariff: null,
      unit,
      updatedAt: null,
    }
  }

  return {
    effectivePricePerUnit: null,
    product,
    reference: null,
    source: null,
    tariff: null,
    unit,
    updatedAt: null,
  }
}

/** A tarifa é da energia: emprestá-la a quem queima litro daria preço de kWh ao diesel. */
function energyTariffOf(input: {
  readonly facts: FuelPriceFacts
  readonly product: FuelProduct
}): EnergyTariff | null {
  return input.product === ELECTRIC_FUEL_PRODUCT ? input.facts.energy : null
}

/**
 * `(TUSD + TE) ÷ 1000 × fator`, com **um** arredondamento: dividir por mil e só então multiplicar
 * fecharia a quarta casa duas vezes sobre o mesmo número, e o tique perdido no meio não volta — ele
 * seguiria para o R$/km de todo veículo elétrico da frota.
 */
function resolveKilowattHourPrice(tariff: EnergyTariff): string {
  const perMegawattHour =
    parseMoney(tariff.tusdPerMegawattHour) + parseMoney(tariff.tePerMegawattHour)

  return formatScaledDecimal(
    divideHalfUp(
      perMegawattHour * parseMoney(tariff.adjustmentFactor),
      KILOWATT_HOURS_PER_MEGAWATT_HOUR * MONEY_FACTOR,
    ),
    MONEY_SCALE,
  )
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: DECIMAL_ERROR_PREFIX,
    scale: MONEY_SCALE,
    value,
  })
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
