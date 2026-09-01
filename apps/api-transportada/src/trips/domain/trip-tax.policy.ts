/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
} from '../../shared/decimal.service.js'
import { VALUATION_GAPS, type TripCostParcel } from './trip-valuation.policy.js'

const ERROR_CODE_PREFIX = 'TRIP_TAX'
const ZERO = '0.0000'

/**
 * ADR-0049 §4: **o ICMS é do documento.** Ele foi calculado na emissão a partir do perfil e viajou
 * no XML, então o valor exato está no payload congelado do CT-e autorizado.
 *
 * `icmsAmount` é `null` quando a nota ainda não virou documento; `'0.0000'` quando o CST é isento,
 * não tributado ou diferido — e essa diferença é a razão de o campo ser anulável: "não paga" e "não
 * sei" não são a mesma resposta.
 */
export type TripTaxDocument = {
  readonly icmsAmount: null | string
}

export type CompanyFederalRates = {
  readonly cofinsRate: string
  readonly pisRate: string
}

export type BuildTripTaxParcelsParams = {
  readonly documents: readonly TripTaxDocument[]
  /** `null` quando a empresa não declarou regime: os federais ficam `missing`, nunca zerados. */
  readonly federalRates: CompanyFederalRates | null
  /** A receita já apurada, que é a base dos federais. */
  readonly revenueAmount: string
}

/**
 * As duas parcelas de imposto, com origens diferentes de propósito.
 *
 * O ICMS é somado dos documentos: recalculá-lo do perfil atual daria um número que discorda do que
 * foi transmitido no dia em que alguém mudar a alíquota — e o documento é o que a SEFAZ tem.
 *
 * PIS/COFINS **não existe no CT-e**: é tributo federal sobre a receita, e a alíquota depende do
 * regime da empresa. Sem configuração ele é `missing`, e a margem aparece marcada como "sem os
 * federais" — assumir um regime erraria em silêncio para metade das instalações, com cara de número
 * certo.
 */
export function buildTripTaxParcels(input: BuildTripTaxParcelsParams): readonly TripCostParcel[] {
  return [buildIcmsParcel(input.documents), buildFederalParcel(input)]
}

function buildIcmsParcel(documents: readonly TripTaxDocument[]): TripCostParcel {
  const emitted = documents.filter((document) => document.icmsAmount !== null)
  if (emitted.length === 0) {
    return { amount: ZERO, gap: VALUATION_GAPS.noFreightRule, kind: 'icms', source: 'missing' }
  }

  const total = emitted.reduce(
    (accumulated, document) => accumulated + toMoney(document.icmsAmount ?? ZERO),
    0n,
  )

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    /**
     * Nota ainda sem documento é lacuna do **conjunto**, não do imposto: o total de ICMS é medido
     * sobre o que existe, e a receita já se declara incompleta pelo mesmo motivo.
     */
    gap: emitted.length === documents.length ? null : VALUATION_GAPS.noFreightRule,
    kind: 'icms',
    source: 'measured',
  }
}

function buildFederalParcel(input: BuildTripTaxParcelsParams): TripCostParcel {
  if (input.federalRates === null) {
    return {
      amount: ZERO,
      gap: VALUATION_GAPS.noFederalRegime,
      kind: 'pis_cofins',
      source: 'missing',
    }
  }

  const revenue = toMoney(input.revenueAmount)
  const rate = toRate(input.federalRates.pisRate) + toRate(input.federalRates.cofinsRate)

  return {
    amount: formatScaledDecimal(divideHalfUp(revenue * rate, PERCENTAGE_FACTOR), MONEY_SCALE),
    gap: null,
    kind: 'pis_cofins',
    /**
     * `measured` porque a alíquota é cadastro do contador, não palpite nosso — e a base é a receita
     * já apurada dos documentos. O que seria estimativa é assumir o regime, e isso não acontece.
     */
    source: 'measured',
  }
}

function toMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

function toRate(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: PERCENTAGE_SCALE, value })
}
