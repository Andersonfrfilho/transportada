/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteIcmsCst } from '../../database/cte-emission-profile.schema.js'
import {
  FISCAL_MONEY_SCALE,
  MONEY_SCALE,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  parseScaledDecimal,
  rescaleHalfUp,
} from '../../shared/decimal.service.js'

/** O mesmo prefixo do builder: a regra saiu de lá, e o código de erro de alíquota malformada não muda. */
const ERROR_CODE_PREFIX = 'CTE_PAYLOAD'

export type IcmsProfileRates = {
  readonly icmsBaseReductionRate: string
  readonly icmsCst: CteIcmsCst
  readonly icmsRate: string
}

/**
 * O que o CT-e diz do ICMS, antes de virar XML. Base e imposto em `FISCAL_MONEY_SCALE` (duas casas),
 * alíquotas em `PERCENTAGE_SCALE` (fração).
 */
export type IcmsComputation =
  | { readonly cst: '60'; readonly kind: 'unsupported' }
  | { readonly cst: '40' | '41' | '51' | '90'; readonly kind: 'untaxed' }
  | {
      readonly amountScaled: bigint
      readonly baseScaled: bigint
      readonly cst: '00' | '90'
      readonly kind: 'taxed'
      readonly rateScaled: bigint
    }
  | {
      readonly amountScaled: bigint
      readonly baseScaled: bigint
      readonly cst: '20'
      readonly kind: 'reduced'
      readonly rateScaled: bigint
      readonly reductionScaled: bigint
    }

/**
 * Spec 125 D1: **a regra de base do ICMS do CT-e, num lugar só.** O builder mapeia o resultado para
 * o grupo `ICMS` do XML; a conta da viagem o usa para projetar o imposto antes de o documento
 * existir. Duas implementações da redução de base divergiriam caladas.
 *
 * - `40`/`41`/`51` e `90` sem alíquota: não há destaque — o CT-e só leva o CST;
 * - `00` e `90`: base cheia × alíquota;
 * - `20`: base × (1 − redução) × alíquota;
 * - `60`: ICMS cobrado por substituição, que o produto **não emite**.
 */
export function computeIcms(
  input: Readonly<{ profile: IcmsProfileRates; totalScaled: bigint }>,
): IcmsComputation {
  const { profile, totalScaled } = input
  const rateScaled = parseRate(profile.icmsRate)

  if (profile.icmsCst === '60') return { cst: '60', kind: 'unsupported' }
  if (profile.icmsCst === '40' || profile.icmsCst === '41' || profile.icmsCst === '51') {
    return { cst: profile.icmsCst, kind: 'untaxed' }
  }
  if (profile.icmsCst === '90' && rateScaled === 0n) return { cst: '90', kind: 'untaxed' }
  if (profile.icmsCst === '00' || profile.icmsCst === '90') {
    return {
      amountScaled: applyRate({ amountScaled: totalScaled, rateScaled }),
      baseScaled: totalScaled,
      cst: profile.icmsCst,
      kind: 'taxed',
      rateScaled,
    }
  }

  const reductionScaled = parseRate(profile.icmsBaseReductionRate)
  const baseScaled =
    totalScaled - applyRate({ amountScaled: totalScaled, rateScaled: reductionScaled })

  return {
    amountScaled: applyRate({ amountScaled: baseScaled, rateScaled }),
    baseScaled,
    cst: '20',
    kind: 'reduced',
    rateScaled,
    reductionScaled,
  }
}

export type IcmsProjection =
  | { readonly amount: string; readonly status: 'taxed' | 'untaxed' }
  | { readonly status: 'unsupported' }

/**
 * O ICMS que o CT-e **vai** destacar sobre `amount` (receita em `MONEY_SCALE`). A receita é
 * arredondada para duas casas antes da conta, como o builder faz com o valor da prestação — e o
 * imposto volta à escala do dinheiro da conta.
 */
export function projectIcmsAmount(
  input: Readonly<{ amount: string; profile: IcmsProfileRates }>,
): IcmsProjection {
  const totalScaled = rescaleHalfUp({
    fromScale: MONEY_SCALE,
    toScale: FISCAL_MONEY_SCALE,
    value: parseScaledDecimal({
      errorCodePrefix: ERROR_CODE_PREFIX,
      scale: MONEY_SCALE,
      value: input.amount,
    }),
  })
  const icms = computeIcms({ profile: input.profile, totalScaled })

  if (icms.kind === 'unsupported') return { status: 'unsupported' }
  if (icms.kind === 'untaxed') return { amount: ZERO, status: 'untaxed' }

  return {
    amount: formatScaledDecimal(
      rescaleHalfUp({
        fromScale: FISCAL_MONEY_SCALE,
        toScale: MONEY_SCALE,
        value: icms.amountScaled,
      }),
      MONEY_SCALE,
    ),
    status: 'taxed',
  }
}

const ZERO = '0.0000'

function parseRate(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: PERCENTAGE_SCALE, value })
}
