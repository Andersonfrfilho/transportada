/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import type { NfseInvoice } from '../shared/nfseInvoice.types'
import {
  planNfseBulkExport,
  resolveNfseBulkExportFailure,
  type NfseBulkExportFailure,
} from '../shared/nfseInvoiceBulkExport.service'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseInvoiceBulkExportInput = Readonly<{
  companyId?: string
  invoices: readonly NfseInvoice[]
  permissions: readonly string[]
}>

export type NfseInvoiceBulkExportController = ReturnType<typeof useNfseInvoiceBulkExport>

/** O ZIP chega inteiro numa resposta: não há progresso por nota para relatar, só sucesso ou código. */
export function useNfseInvoiceBulkExport(input: UseNfseInvoiceBulkExportInput) {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions,
  })
  const plan = planNfseBulkExport({ invoices: input.invoices, permissions })

  const runMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => controller.exportInvoices({ invoiceIds }),
    onSuccess: saveArchiveFile,
  })

  const failure: NfseBulkExportFailure | null = runMutation.isError
    ? resolveNfseBulkExportFailure(runMutation.error)
    : null

  return {
    download: () => {
      if (plan.eligible.length === 0) return
      runMutation.mutate(plan.eligible.map((invoice) => invoice.id))
    },
    eligibleCount: plan.eligible.length,
    failure,
    isAllowed: plan.isAllowed,
    isPending: runMutation.isPending,
  }
}
