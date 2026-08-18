/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { NFSE_INVOICES_QUERY_KEY } from '../shared/nfseInvoice.constant'
import type { NfseInvoice } from '../shared/nfseInvoice.types'
import {
  planNfseBulkReissue,
  summarizeNfseBulkReissue,
  type NfseBulkReissueOutcome,
  type NfseBulkReissueSummary,
} from '../shared/nfseInvoiceBulkReissue.service'
import { buildNfseReissueIdempotencyKey } from '../shared/nfseInvoiceRowActions.service'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseInvoiceBulkReissueInput = Readonly<{
  companyId?: string
  invoices: readonly NfseInvoice[]
  permissions: readonly string[]
}>

type BulkReissueRun = Readonly<{
  invoices: readonly NfseInvoice[]
  token: string
}>

export type NfseInvoiceBulkReissueController = ReturnType<typeof useNfseInvoiceBulkReissue>

export function useNfseInvoiceBulkReissue(input: UseNfseInvoiceBulkReissueInput) {
  const [isOpen, setIsOpen] = useState(false)
  const [attemptToken, setAttemptToken] = useState('')
  const [summary, setSummary] = useState<NfseBulkReissueSummary | null>(null)

  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions,
  })
  const plan = planNfseBulkReissue({ invoices: input.invoices, permissions })

  const runMutation = useMutation({
    mutationFn: async (run: BulkReissueRun): Promise<readonly NfseBulkReissueOutcome[]> => {
      const outcomes: NfseBulkReissueOutcome[] = []

      /* Sequencial de propósito: a prefeitura é um terceiro, e o lote inteiro de uma vez vira 429. */
      for (const invoice of run.invoices) {
        try {
          await controller.reissueInvoice({
            idempotencyKey: buildNfseReissueIdempotencyKey({
              invoiceId: invoice.id,
              token: run.token,
            }),
            invoiceId: invoice.id,
          })
          outcomes.push({ invoiceId: invoice.id, isReissued: true })
        } catch {
          /* Uma nota recusada não derruba as seguintes: o resultado por nota é relatado no fim. */
          outcomes.push({ invoiceId: invoice.id, isReissued: false })
        }
      }

      return outcomes
    },
    onSuccess: (outcomes) => {
      setSummary(summarizeNfseBulkReissue(outcomes))
      return queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
    },
  })

  function close(): void {
    setIsOpen(false)
    setSummary(null)
    runMutation.reset()
  }

  return {
    close,
    confirm: () => {
      if (plan.eligible.length === 0) return
      runMutation.mutate({ invoices: plan.eligible, token: attemptToken })
    },
    isAllowed: plan.isAllowed,
    isOpen,
    isPending: runMutation.isPending,
    open: () => {
      setIsOpen(true)
      setSummary(null)
      setAttemptToken(crypto.randomUUID())
      runMutation.reset()
    },
    plan,
    summary,
  }
}
