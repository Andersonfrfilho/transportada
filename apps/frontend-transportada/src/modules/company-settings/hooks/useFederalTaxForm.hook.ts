/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FederalTaxSettings } from '../shared/federalTax.validation'
import {
  buildFederalTaxSubmission,
  chooseFederalRegime,
  regimesForTaxRegime,
  startFederalTaxDraft,
  typeFederalRate,
  type FederalTaxDraft,
  type FederalTaxRegimeCode,
  type FederalTaxSubmission,
} from '../shared/federalTaxSuggestion.service'
import { isFederalRegime } from '../shared/federalTax.validation'

/**
 * O rascunho do painel. As transições são funções puras de `federalTaxSuggestion.service.ts` — é
 * lá que o contrato as prova, porque o teste desta app não tem DOM. O painel remonta por `key`
 * quando o gravado chega, e o rascunho nasce dele.
 */
export function useFederalTaxForm(
  input: Readonly<{ stored: FederalTaxSettings | null; taxRegime: FederalTaxRegimeCode | null }>,
) {
  const [draft, setDraft] = useState<FederalTaxDraft>(() => startFederalTaxDraft(input))
  const submission: FederalTaxSubmission | null = buildFederalTaxSubmission(draft)

  function handleRegimeChange(value: string) {
    if (isFederalRegime(value)) setDraft(chooseFederalRegime(value))
  }

  function handleRateChange(field: 'cofins' | 'pis', text: string) {
    setDraft((current) => typeFederalRate({ draft: current, field, text }))
  }

  return {
    draft,
    handleRateChange,
    handleRegimeChange,
    regimes: regimesForTaxRegime(input.taxRegime),
    submission,
  }
}
