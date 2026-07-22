/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  NfeDocumentListPage,
  NfeImportListPage,
  NfeImportSummary,
} from './nfeWorkspaceClient.service'

export type NfeWorkspaceViewModel = Readonly<{
  activeImport?: NfeImportSummary
  canImport: boolean
  canRead: boolean
  documents?: NfeDocumentListPage['items']
  imports?: NfeImportListPage['items']
  shouldPollActiveImport?: boolean
  status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready' | 'running'
}>

type ViewModelInput = Readonly<{
  documents?: NfeDocumentListPage | undefined
  imports?: NfeImportListPage | undefined
  permissions: readonly string[]
  status: 'error' | 'loading' | 'success'
}>

export type NfeWorkspaceViewModelFactory = (input: ViewModelInput) => NfeWorkspaceViewModel

const IMPORT_PERMISSION = 'invoices.import'
const READ_PERMISSION = 'invoices.read'
const TERMINAL_IMPORT_STATUSES = ['cancelled', 'completed', 'failed', 'partially_processed']

export const createNfeWorkspaceViewModel: NfeWorkspaceViewModelFactory = (input) => {
  const canImport = input.permissions.includes(IMPORT_PERMISSION)
  const canRead = input.permissions.includes(READ_PERMISSION)

  if (!canImport && !canRead) {
    return { canImport, canRead, status: 'forbidden' }
  }
  if (input.status !== 'success') {
    return { canImport, canRead, status: input.status }
  }

  const imports = input.imports?.items ?? []
  const documents = input.documents?.items ?? []
  const activeImport = imports[0]
  const shouldPollActiveImport =
    activeImport !== undefined && !TERMINAL_IMPORT_STATUSES.includes(activeImport.status)

  if (imports.length === 0 && documents.length === 0) {
    return { canImport, canRead, status: 'empty' }
  }

  return {
    ...(activeImport === undefined ? {} : { activeImport }),
    canImport,
    canRead,
    documents,
    imports,
    shouldPollActiveImport,
    status: shouldPollActiveImport ? 'running' : 'ready',
  }
}
