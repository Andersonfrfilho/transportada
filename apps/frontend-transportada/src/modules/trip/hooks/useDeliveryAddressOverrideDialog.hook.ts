/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useRef, useState } from 'react'

import type { DeliveryAddressOverride, OverrideDeliveryAddressInput } from '../shared/trip.types'

export type DeliveryAddressOverrideDraft = Readonly<{
  cityCode: string
  newLabel: string
  number: string
  postalCode: string
  reason: string
  requestedBy: string
}>

const EMPTY_DRAFT: DeliveryAddressOverrideDraft = {
  cityCode: '',
  newLabel: '',
  number: '',
  postalCode: '',
  reason: '',
  requestedBy: '',
}

export type DeliveryAddressOverrideDialogInput = Readonly<{
  documentId: string
  loadHistory: () => Promise<readonly DeliveryAddressOverride[]>
  onOverride: (input: OverrideDeliveryAddressInput) => Promise<unknown>
  tripId: string
}>

export type DeliveryAddressOverrideDialogController = ReturnType<
  typeof useDeliveryAddressOverrideDialog
>

/** Cada campo vazio vira `null` no corpo — o mesmo formato de `StopAddressComponents`, que aceita
 * endereço sem CEP normalizável como um endereço válido (parada `SEM ENDEREÇO`). */
function toNullable(value: string): null | string {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function useDeliveryAddressOverrideDialog(input: DeliveryAddressOverrideDialogInput) {
  const [draft, setDraft] = useState<DeliveryAddressOverrideDraft>(EMPTY_DRAFT)
  const [history, setHistory] = useState<readonly DeliveryAddressOverride[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)

  function setField<TField extends keyof DeliveryAddressOverrideDraft>(
    field: TField,
    value: string,
  ): void {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
    setSubmitError(undefined)
  }, [])

  /**
   * `loadHistory` chega como closure nova a cada render de quem chama (o controlador de
   * `useTripWorkspace` é reconstruído todo render, então nada nele é referencialmente estável).
   * Depender dela diretamente tornava `refreshHistory` instável, e o `useEffect` que busca o
   * histórico ao abrir o diálogo re-disparava a cada render que ele mesmo causava — laço infinito
   * martelando a rota de histórico. A referência guarda a versão mais recente sem entrar na
   * identidade da função.
   */
  const loadHistoryRef = useRef(input.loadHistory)
  loadHistoryRef.current = input.loadHistory

  const refreshHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      setHistory(await loadHistoryRef.current())
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  async function submit(): Promise<boolean> {
    setSubmitError(undefined)
    setIsSubmitting(true)
    try {
      await input.onOverride({
        documentId: input.documentId,
        newAddress: {
          cityCode: toNullable(draft.cityCode),
          number: toNullable(draft.number),
          postalCode: toNullable(draft.postalCode),
        },
        newLabel: draft.newLabel.trim(),
        reason: draft.reason.trim(),
        requestedBy: draft.requestedBy.trim(),
        tripId: input.tripId,
      })
      reset()
      await refreshHistory()
      return true
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'TRIP_REQUEST_FAILED')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit =
    draft.newLabel.trim().length > 0 &&
    draft.requestedBy.trim().length > 0 &&
    draft.reason.trim().length > 0

  return {
    canSubmit,
    draft,
    history,
    isLoadingHistory,
    isSubmitting,
    refreshHistory,
    reset,
    setField,
    submit,
    submitError,
  }
}
