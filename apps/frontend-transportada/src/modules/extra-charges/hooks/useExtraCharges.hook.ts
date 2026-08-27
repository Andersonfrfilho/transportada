/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getExtraChargesClient } from '../shared/extraChargesClient.service'
import type {
  Contractor,
  DeliveryCharge,
  ExtraChargeBatchReport,
} from '../shared/extraCharges.types'

const EXTRA_CHARGES_QUERY_KEY = 'extra-charges'
const TRIP_MANAGE_PERMISSION = 'trip.manage'
const BILLING_CREATE_PERMISSION = 'billing.create'

export type ExtraChargesController = Readonly<{
  canCloseBatch: boolean
  canConfirm: boolean
  closeBatch: (
    input: Readonly<{ contractorId: string; periodEnd: string; periodStart: string }>,
  ) => Promise<void>
  confirmCharges: (charges: readonly Readonly<{ amount?: string; id: string }>[]) => Promise<void>
  contractors: readonly Contractor[]
  dismissCharge: (input: Readonly<{ id: string; reason: string }>) => Promise<void>
  isLoading: boolean
  lastError: string | null
  openReport: (batchId: string) => void
  report: ExtraChargeBatchReport | undefined
  suggestions: readonly DeliveryCharge[]
}>

/**
 * Spec 060 D4b/D5: a fila de conferência e o fechamento do período moram na mesma tela porque são o
 * mesmo trabalho, em dois tempos: confirmar o que aconteceu e mandar a conta para quem paga.
 */
export function useExtraCharges(
  input: Readonly<{ permissions: readonly string[] }>,
): ExtraChargesController {
  const queryClient = useQueryClient()
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const suggestions = useQuery({
    queryFn: () => getExtraChargesClient().listCharges('suggested'),
    queryKey: [EXTRA_CHARGES_QUERY_KEY, 'suggested'],
  })
  const contractors = useQuery({
    queryFn: () => getExtraChargesClient().listContractors(),
    queryKey: [EXTRA_CHARGES_QUERY_KEY, 'contractors'],
  })
  const report = useQuery({
    enabled: openBatchId !== null,
    queryFn: () => getExtraChargesClient().readReport(openBatchId ?? ''),
    queryKey: [EXTRA_CHARGES_QUERY_KEY, 'report', openBatchId],
  })

  /**
   * A revalidação **não** é devolvida ao TanStack: `isPending` só cai quando a promise de
   * `onSuccess` resolve, e prender o botão até o cache esfriar faz o operador ler trabalho pendente
   * onde já não há — e clicar de novo.
   */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: [EXTRA_CHARGES_QUERY_KEY] })
  }

  const confirm = useMutation({
    mutationFn: (charges: readonly Readonly<{ amount?: string; id: string }>[]) =>
      getExtraChargesClient().confirmCharges(charges),
    onSuccess: invalidate,
  })
  const dismiss = useMutation({
    mutationFn: (request: Readonly<{ id: string; reason: string }>) =>
      getExtraChargesClient().dismissCharge(request),
    onSuccess: invalidate,
  })
  const close = useMutation({
    mutationFn: (
      request: Readonly<{ contractorId: string; periodEnd: string; periodStart: string }>,
    ) => getExtraChargesClient().closeBatch(request),
    onSuccess: (batch) => {
      setOpenBatchId(batch.id)
      invalidate()
    },
  })

  /** O código da recusa sobe como veio: `EXTRA_CHARGE_BATCH_EMPTY` tem tradução própria na tela. */
  async function guard(operation: () => Promise<unknown>): Promise<void> {
    setLastError(null)
    try {
      await operation()
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'REQUEST_FAILED')
    }
  }

  return {
    canCloseBatch: input.permissions.includes(BILLING_CREATE_PERMISSION),
    canConfirm: input.permissions.includes(TRIP_MANAGE_PERMISSION),
    closeBatch: (request) => guard(() => close.mutateAsync(request)),
    confirmCharges: (charges) => guard(() => confirm.mutateAsync(charges)),
    contractors: contractors.data ?? [],
    dismissCharge: (request) => guard(() => dismiss.mutateAsync(request)),
    isLoading: suggestions.isLoading,
    lastError,
    openReport: setOpenBatchId,
    report: report.data,
    suggestions: suggestions.data ?? [],
  }
}
