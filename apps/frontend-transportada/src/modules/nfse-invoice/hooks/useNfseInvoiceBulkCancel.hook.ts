/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  NFSE_INVOICES_QUERY_KEY,
  type NfseCancellationMotive,
} from '../shared/nfseInvoice.constant'
import type { NfseInvoice } from '../shared/nfseInvoice.types'
import {
  planNfseBulkCancellation,
  summarizeNfseBulkCancellation,
  type NfseBulkCancelOutcome,
  type NfseBulkCancelSummary,
} from '../shared/nfseInvoiceBulkCancel.service'
import {
  buildNfseCancellationIdempotencyKey,
  validateNfseCancellationReason,
} from '../shared/nfseInvoiceRowActions.service'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseInvoiceBulkCancelInput = Readonly<{
  companyId?: string
  invoices: readonly NfseInvoice[]
  permissions: readonly string[]
}>

type BulkCancelRun = Readonly<{
  invoices: readonly NfseInvoice[]
  motive: NfseCancellationMotive
  reason: string
  token: string
}>

export type NfseInvoiceBulkCancelController = ReturnType<typeof useNfseInvoiceBulkCancel>

export function useNfseInvoiceBulkCancel(input: UseNfseInvoiceBulkCancelInput) {
  const [isOpen, setIsOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  /** O lote leva um código só: escolhido uma vez, e o mesmo para toda nota que entrar. */
  const [cancellationMotive, setCancellationMotive] = useState<'' | NfseCancellationMotive>('')
  const [attemptToken, setAttemptToken] = useState('')
  const [summary, setSummary] = useState<NfseBulkCancelSummary | null>(null)

  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions,
  })
  const plan = planNfseBulkCancellation({ invoices: input.invoices, permissions })
  const reasonCheck = validateNfseCancellationReason(cancellationReason)
  const isCancelReady = reasonCheck.status === 'ready' && cancellationMotive !== ''

  const runMutation = useMutation({
    mutationFn: async (run: BulkCancelRun): Promise<readonly NfseBulkCancelOutcome[]> => {
      const outcomes: NfseBulkCancelOutcome[] = []

      /* Sequencial de propósito: a prefeitura é um terceiro, e o lote inteiro de uma vez vira 429. */
      for (const invoice of run.invoices) {
        try {
          await controller.cancelInvoice({
            cancellationMotive: run.motive,
            cancellationReason: run.reason,
            idempotencyKey: buildNfseCancellationIdempotencyKey({
              invoiceId: invoice.id,
              token: run.token,
            }),
            invoiceId: invoice.id,
          })
          outcomes.push({ invoiceId: invoice.id, isCancelled: true })
        } catch {
          /* Uma nota recusada não derruba as seguintes: o resultado por nota é relatado no fim. */
          outcomes.push({ invoiceId: invoice.id, isCancelled: false })
        }
      }

      return outcomes
    },
    // Cancelar solta a nota fiscal: sem o efeito, a tabela de notas segue com o bloqueio antigo.
    onSuccess: async (outcomes) => {
      setSummary(summarizeNfseBulkCancellation(outcomes))
      await queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
      await invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
    },
  })

  function close(): void {
    setIsOpen(false)
    setCancellationReason('')
    setCancellationMotive('')
    setSummary(null)
    runMutation.reset()
  }

  return {
    cancellationMotive,
    cancellationReason,
    close,
    confirm: () => {
      if (plan.eligible.length === 0 || cancellationMotive === '') return
      if (reasonCheck.status !== 'ready') return
      runMutation.mutate({
        invoices: plan.eligible,
        motive: cancellationMotive,
        reason: reasonCheck.value,
        token: attemptToken,
      })
    },
    isAllowed: plan.isAllowed,
    isCancelReady,
    isOpen,
    isPending: runMutation.isPending,
    open: () => {
      setIsOpen(true)
      setCancellationReason('')
      setCancellationMotive('')
      setSummary(null)
      setAttemptToken(crypto.randomUUID())
      runMutation.reset()
    },
    plan,
    reasonBlock: reasonCheck.status === 'blocked' ? reasonCheck.reason : null,
    setCancellationMotive,
    setCancellationReason,
    summary,
  }
}
