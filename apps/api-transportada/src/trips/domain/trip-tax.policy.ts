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
import type { DocumentIcms } from './trip-icms-projection.policy.js'
import {
  VALUATION_GAPS,
  type TripCostParcel,
  type TripCostParcelBasis,
  type ValuationGap,
  type ValuationSource,
} from './trip-valuation.policy.js'

const ERROR_CODE_PREFIX = 'TRIP_TAX'
const ZERO = '0.0000'

/**
 * ADR-0049 §4: **o ICMS é do documento.** Ele foi calculado na emissão a partir do perfil e viajou
 * no XML, então o valor exato está no payload congelado do CT-e autorizado.
 *
 * Spec 125: enquanto o documento não existe, `icms` traz a **projeção** pelo perfil que rege a nota
 * (`resolveDocumentIcms`). Quem só tem o valor do documento passa `icmsAmount`: `null` é "ainda sem
 * CT-e", `'0.0000'` é CST isento — "não paga" e "não sei" não são a mesma resposta.
 */
export type TripTaxDocument = {
  readonly icms?: DocumentIcms
  readonly icmsAmount?: null | string
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
  /**
   * Spec 126 regra 6: a origem da receita. A alíquota é afirmada, mas sobre receita **prevista** o
   * federal ainda é projeção. Ausente é o comportamento de antes (`measured`).
   */
  readonly revenueSource?: ValuationSource
}

/**
 * As duas parcelas de imposto, com origens diferentes de propósito.
 *
 * O ICMS é somado dos documentos — e, antes deles, da projeção pelo perfil de emissão (spec 125),
 * pela mesma regra de base que o CT-e vai usar.
 *
 * PIS/COFINS **não existe no CT-e**: é tributo federal sobre a receita, e a alíquota depende do
 * regime da empresa. Sem configuração ele é `missing`, e a margem aparece marcada como "sem os
 * federais" — assumir um regime erraria em silêncio para metade das instalações, com cara de número
 * certo.
 */
export function buildTripTaxParcels(input: BuildTripTaxParcelsParams): readonly TripCostParcel[] {
  return [buildIcmsParcel(input.documents.map(toDocumentIcms)), buildFederalParcel(input)]
}

function toDocumentIcms(document: TripTaxDocument): DocumentIcms {
  if (document.icms !== undefined) return document.icms
  if (document.icmsAmount !== undefined && document.icmsAmount !== null) {
    return { amount: document.icmsAmount, status: 'measured' }
  }

  return { gap: VALUATION_GAPS.noFreightRule, status: 'missing' }
}

/**
 * A soma das notas conhecidas — medidas ou projetadas —, com o pior caso da origem: uma projetada
 * torna a parcela estimada. Nota ausente é lacuna do **conjunto**: o total soma o que existe, e
 * `detail` diz quantas ficaram de fora (`ausentes/total`).
 */
function buildIcmsParcel(documents: readonly DocumentIcms[]): TripCostParcel {
  const known = documents.filter((document) => document.status !== 'missing')
  const missingGaps = documents.flatMap((document) =>
    document.status === 'missing' ? [document.gap] : [],
  )

  if (known.length === 0) {
    return {
      amount: ZERO,
      detail: null,
      gap: pickGap(missingGaps) ?? VALUATION_GAPS.noFreightRule,
      kind: 'icms',
      source: 'missing',
    }
  }

  const total = known.reduce((accumulated, document) => accumulated + toMoney(document.amount), 0n)
  const isProjected = known.some((document) => document.status === 'projected')
  const basis = buildIcmsBasis(known)

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    ...(basis === null ? {} : { basis }),
    detail: missingGaps.length === 0 ? null : `${missingGaps.length}/${documents.length}`,
    gap: pickGap(missingGaps),
    kind: 'icms',
    source: isProjected ? 'estimated' : 'measured',
  }
}

/**
 * A frase só existe quando **toda** nota foi projetada pelo mesmo CST e as mesmas frações: com
 * documento no meio, ou perfis diferentes, uma frase única explicaria só parte da soma.
 */
function buildIcmsBasis(known: readonly DocumentIcms[]): null | TripCostParcelBasis {
  const [first] = known
  if (first?.status !== 'projected') return null

  const isUniform = known.every(
    (document) =>
      document.status === 'projected' &&
      document.cst === first.cst &&
      document.rate === first.rate &&
      document.baseReductionRate === first.baseReductionRate,
  )
  if (!isUniform) return null

  return {
    baseReductionRate: first.baseReductionRate,
    cst: first.cst,
    of: 'icms',
    rate: first.rate,
  }
}

/** Entre as causas, a que se resolve em cadastro vem primeiro — é a que o operador pode atacar. */
const GAP_PRIORITY: readonly ValuationGap[] = [
  VALUATION_GAPS.noEmissionProfile,
  VALUATION_GAPS.icmsCstUnsupported,
  VALUATION_GAPS.noFreightRule,
]

function pickGap(gaps: readonly ValuationGap[]): null | ValuationGap {
  if (gaps.length === 0) return null

  return GAP_PRIORITY.find((gap) => gaps.includes(gap)) ?? gaps[0] ?? null
}

function buildFederalParcel(input: BuildTripTaxParcelsParams): TripCostParcel {
  if (input.federalRates === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.noFederalRegime,
      kind: 'pis_cofins',
      source: 'missing',
    }
  }

  const revenue = toMoney(input.revenueAmount)
  const rate = toRate(input.federalRates.pisRate) + toRate(input.federalRates.cofinsRate)

  return {
    amount: formatScaledDecimal(divideHalfUp(revenue * rate, PERCENTAGE_FACTOR), MONEY_SCALE),
    detail: null,
    gap: null,
    kind: 'pis_cofins',
    /**
     * A alíquota é cadastro do contador, não palpite nosso — assumir o regime não acontece. Mas a
     * base segue a receita: sobre receita prevista (antes do CT-e) o número é projeção (spec 126).
     */
    source:
      input.revenueSource === undefined || input.revenueSource === 'measured'
        ? 'measured'
        : 'estimated',
  }
}

function toMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

function toRate(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: PERCENTAGE_SCALE, value })
}
