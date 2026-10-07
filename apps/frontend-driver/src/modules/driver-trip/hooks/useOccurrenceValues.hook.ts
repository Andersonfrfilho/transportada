/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { DriverNfeProduct, DriverOccurrenceType } from '../shared/driverTrip.types'
import {
  sanitizeQuantityInput,
  sanitizeReferenceNumberInput,
} from '../shared/occurrenceDecimalInput.service'
import {
  EMPTY_OCCURRENCE_ITEM_DRAFT,
  evaluateOccurrenceValues,
  resolveDefaultQuantityText,
  type OccurrenceItemDraft,
  type OccurrenceItemDrafts,
  type OccurrenceValues,
} from '../shared/occurrenceDraftValues.service'
import { maskMoneyInput } from '../shared/occurrenceMoneyMask.service'
import { resolveOccurrenceRequirements } from '../shared/occurrenceRequirements.service'

/** Sem tipo escolhido ainda não há o que cobrar: o formulário nem mostra estes campos. */
const NO_TYPE: DriverOccurrenceType = { id: '', name: '' }

export type OccurrenceValuesForm = Readonly<{
  declaredAmountText: string
  handleDeclaredAmountChange: (text: string) => void
  handleItemAmountChange: (input: { readonly code: string; readonly text: string }) => void
  handleItemQuantityChange: (input: { readonly code: string; readonly text: string }) => void
  handleItemToggle: (code: string) => void
  handleReferenceNumberChange: (text: string) => void
  referenceNumberText: string
  values: OccurrenceValues
}>

/**
 * Spec 247 (T5.3): o estado dos produtos marcados, das quantidades, do valor pago e do número do
 * documento. Tudo é texto até `evaluateOccurrenceValues` — a única conta é a dela, e é derivada: nada
 * de soma guardada em estado.
 */
export function useOccurrenceValues(params: {
  readonly products: readonly DriverNfeProduct[]
  readonly type: DriverOccurrenceType | undefined
}): OccurrenceValuesForm {
  const [drafts, setDrafts] = useState<OccurrenceItemDrafts>({})
  const [referenceNumberText, setReferenceNumberText] = useState('')
  const [declaredAmountText, setDeclaredAmountText] = useState('')

  const values = evaluateOccurrenceValues({
    drafts,
    products: params.products,
    requirements: resolveOccurrenceRequirements(params.type ?? NO_TYPE),
    texts: { declaredAmount: declaredAmountText, referenceNumber: referenceNumberText },
  })

  function updateDraft(input: {
    readonly code: string
    readonly update: (draft: OccurrenceItemDraft) => OccurrenceItemDraft
  }): void {
    setDrafts((current) => ({
      ...current,
      [input.code]: input.update(current[input.code] ?? EMPTY_OCCURRENCE_ITEM_DRAFT),
    }))
  }

  function handleItemToggle(code: string): void {
    const product = params.products.find((candidate) => candidate.code === code)
    updateDraft({
      code,
      update: (draft) => {
        const isSelected = !draft.isSelected
        const needsSuggestion = isSelected && draft.quantityText === '' && product !== undefined
        return {
          ...draft,
          isSelected,
          quantityText: needsSuggestion ? resolveDefaultQuantityText(product) : draft.quantityText,
        }
      },
    })
  }

  return {
    declaredAmountText,
    handleDeclaredAmountChange: (text) =>
      setDeclaredAmountText((previousText) => maskMoneyInput({ previousText, text })),
    handleItemAmountChange: ({ code, text }) =>
      updateDraft({
        code,
        update: (draft) => ({
          ...draft,
          declaredAmountText: maskMoneyInput({ previousText: draft.declaredAmountText, text }),
        }),
      }),
    handleItemQuantityChange: ({ code, text }) =>
      updateDraft({
        code,
        update: (draft) => ({
          ...draft,
          quantityText: sanitizeQuantityInput(text),
        }),
      }),
    handleItemToggle,
    handleReferenceNumberChange: (text) =>
      setReferenceNumberText(sanitizeReferenceNumberInput(text)),
    referenceNumberText,
    values,
  }
}
