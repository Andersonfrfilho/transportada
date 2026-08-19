/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import { NFSE_INVOICES_QUERY_KEY } from '../shared/nfseInvoice.constant'
import type { NfseInvoice } from '../shared/nfseInvoice.types'
import {
  planNfseBulkDiscard,
  summarizeNfseBulkDiscard,
  type NfseBulkDiscardOutcome,
  type NfseBulkDiscardSummary,
} from '../shared/nfseInvoiceBulkDiscard.service'
import { buildNfseDiscardIdempotencyKey } from '../shared/nfseInvoiceRowActions.service'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseInvoiceBulkDiscardInput = Readonly<{
  companyId?: string
  invoices: readonly NfseInvoice[]
  permissions: readonly string[]
}>

type BulkDiscardRun = Readonly<{
  invoices: readonly NfseInvoice[]
  token: string
}>

export type NfseInvoiceBulkDiscardController = ReturnType<typeof useNfseInvoiceBulkDiscard>

export function useNfseInvoiceBulkDiscard(input: UseNfseInvoiceBulkDiscardInput) {
  const [isOpen, setIsOpen] = useState(false)
  const [attemptToken, setAttemptToken] = useState('')
  const [summary, setSummary] = useState<NfseBulkDiscardSummary | null>(null)

  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions,
  })
  const plan = planNfseBulkDiscard({ invoices: input.invoices, permissions })

  const runMutation = useMutation({
    mutationFn: async (run: BulkDiscardRun): Promise<readonly NfseBulkDiscardOutcome[]> => {
      const outcomes: NfseBulkDiscardOutcome[] = []

      /* Sequencial de propósito: a prefeitura é um terceiro, e o lote inteiro de uma vez vira 429. */
      for (const invoice of run.invoices) {
        try {
          await controller.discardInvoice({
            idempotencyKey: buildNfseDiscardIdempotencyKey({
              invoiceId: invoice.id,
              token: run.token,
            }),
            invoiceId: invoice.id,
          })
          outcomes.push({ invoiceId: invoice.id, isDiscarded: true })
        } catch {
          /* Uma nota recusada não derruba as seguintes: o resultado por nota é relatado no fim. */
          outcomes.push({ invoiceId: invoice.id, isDiscarded: false })
        }
      }

      return outcomes
    },
    // Descartar solta a nota fiscal: sem o efeito, a tabela de notas segue com o bloqueio antigo.
    onSuccess: async (outcomes) => {
      setSummary(summarizeNfseBulkDiscard(outcomes))
      await queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
      await invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
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
