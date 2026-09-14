/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  fractionToPercentage,
  percentageToFraction,
} from '@/modules/shared/fractionPercentage.service'

import {
  FEDERAL_REGIMES,
  type FederalRegime,
  type FederalTaxSettings,
} from './federalTax.validation'

export { FEDERAL_REGIMES } from './federalTax.validation'

/**
 * Spec 126: **a sugestão é a alíquota da lei, e quem confirma é o contador.**
 *
 * - Simples Nacional (CRT 1/2): PIS e COFINS dentro do DAS — zero na margem;
 * - Lucro Presumido, cumulativo: PIS 0,65% (Lei 9.715/1998, art. 8º, I) e COFINS 3% (Lei 9.718/1998,
 *   art. 8º);
 * - Lucro Real, não cumulativo: PIS 1,65% (Lei 10.637/2002, art. 2º) e COFINS 7,6% (Lei
 *   10.833/2003, art. 2º) — nominais; os créditos do regime baixam a efetiva, e o contador ajusta.
 */
const SUGGESTED_RATES: Readonly<Record<FederalRegime, Readonly<{ cofins: string; pis: string }>>> =
  {
    presumed: { cofins: '3,00', pis: '0,65' },
    real: { cofins: '7,60', pis: '1,65' },
    simple: { cofins: '0,00', pis: '0,00' },
  }

export type FederalTaxRegimeCode = '1' | '2' | '3'

/** De onde veio o número do campo: gravado, sugerido pela lei, ou digitado agora. */
export type FederalRateOrigin = 'stored' | 'suggested' | 'typed'

export type FederalTaxDraft = Readonly<{
  cofins: string
  cofinsOrigin: FederalRateOrigin | null
  pis: string
  pisOrigin: FederalRateOrigin | null
  regime: '' | FederalRegime
}>

export type FederalTaxSubmission = Readonly<{
  cofinsRate: string
  federalRegime: FederalRegime
  pisRate: string
}>

/** CRT 1/2 só tem o Simples; CRT 3 escolhe entre Presumido e Real; sem perfil fiscal, todos. */
export function regimesForTaxRegime(
  taxRegime: FederalTaxRegimeCode | null,
): readonly FederalRegime[] {
  if (taxRegime === '1' || taxRegime === '2') return ['simple']
  if (taxRegime === '3') return ['presumed', 'real']

  return [...FEDERAL_REGIMES]
}

export function suggestFederalRates(
  regime: FederalRegime,
): Readonly<{ cofins: string; pis: string }> {
  return SUGGESTED_RATES[regime]
}

export function chooseFederalRegime(regime: FederalRegime): FederalTaxDraft {
  const suggested = suggestFederalRates(regime)

  return {
    cofins: suggested.cofins,
    cofinsOrigin: 'suggested',
    pis: suggested.pis,
    pisOrigin: 'suggested',
    regime,
  }
}

/** O gravado vence a sugestão; sem gravado, o Simples já nasce preenchido (não há o que escolher). */
export function startFederalTaxDraft(
  input: Readonly<{ stored: FederalTaxSettings | null; taxRegime: FederalTaxRegimeCode | null }>,
): FederalTaxDraft {
  if (input.stored !== null) {
    return {
      cofins: toPercentText(input.stored.cofinsRate),
      cofinsOrigin: 'stored',
      pis: toPercentText(input.stored.pisRate),
      pisOrigin: 'stored',
      regime: input.stored.federalRegime,
    }
  }

  const [only, ...others] = regimesForTaxRegime(input.taxRegime)
  if (only !== undefined && others.length === 0) return chooseFederalRegime(only)

  return { cofins: '', cofinsOrigin: null, pis: '', pisOrigin: null, regime: '' }
}

/** Digitar apaga a marca de sugestão: o que se grava é o que a empresa afirma. */
export function typeFederalRate(
  input: Readonly<{ draft: FederalTaxDraft; field: 'cofins' | 'pis'; text: string }>,
): FederalTaxDraft {
  return input.field === 'pis'
    ? { ...input.draft, pis: input.text, pisOrigin: 'typed' }
    : { ...input.draft, cofins: input.text, cofinsOrigin: 'typed' }
}

/** Percentual na tela, fração no corpo — `null` enquanto o rascunho não forma uma declaração. */
export function buildFederalTaxSubmission(draft: FederalTaxDraft): FederalTaxSubmission | null {
  if (draft.regime === '') return null
  const pisRate = percentageToFraction(draft.pis)
  const cofinsRate = percentageToFraction(draft.cofins)
  if (pisRate === null || cofinsRate === null) return null

  return { cofinsRate, federalRegime: draft.regime, pisRate }
}

/** `'0.006500'` → `'0,65'`: duas casas, vírgula — o que o contador lê na legislação. */
function toPercentText(fraction: string): string {
  const [integer = '0', decimals = ''] = fractionToPercentage(fraction).split('.')

  return `${integer},${`${decimals}00`.slice(0, 2)}`
}
