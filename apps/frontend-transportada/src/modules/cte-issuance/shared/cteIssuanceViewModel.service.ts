/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteIssuanceDocumentPage, CteIssuanceSummary } from './cteIssuanceClient.service'

export type CteIssuanceViewModel = Readonly<{
  canDownloadXml?: boolean
  canReprocess?: boolean
  canSubmitCte: boolean
  documents?: CteIssuanceDocumentPage['items']
  issuance?: CteIssuanceSummary
  rejectionCode?: string
  shouldPollStatus?: boolean
  status:
    | 'authorized'
    | 'error'
    | 'failed'
    | 'forbidden'
    | 'loading'
    | 'rejected'
    | 'requested'
    | 'retry_scheduled'
}>

type ViewModelInput = Readonly<{
  documents?: CteIssuanceDocumentPage | undefined
  issuance?: CteIssuanceSummary | undefined
  permissions: readonly string[]
  status: 'error' | 'loading' | 'success'
}>

const CTE_SUBMIT = 'cte.submit'

export function createCteIssuanceViewModel(input: ViewModelInput): CteIssuanceViewModel {
  const canSubmitCte = input.permissions.includes(CTE_SUBMIT)
  if (!canSubmitCte) return { canSubmitCte, status: 'forbidden' }
  if (input.status !== 'success') return { canSubmitCte, status: input.status }

  const issuance = input.issuance
  const documents = input.documents?.items ?? []
  const status = issuance?.status ?? 'requested'

  return {
    canDownloadXml: status === 'authorized' && documents.length > 0,
    canReprocess: status === 'rejected' || status === 'failed',
    canSubmitCte,
    ...(documents.length === 0 ? {} : { documents }),
    ...(issuance === undefined ? {} : { issuance }),
    ...(issuance?.reasonCode === undefined ? {} : { rejectionCode: issuance.reasonCode }),
    shouldPollStatus: status === 'requested' || status === 'retry_scheduled',
    status,
  }
}
