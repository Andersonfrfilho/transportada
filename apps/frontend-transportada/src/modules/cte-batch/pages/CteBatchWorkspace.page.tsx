/* Copyright (c) 2026 Ada Technology. MIT License. */

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useCteBatchWorkspace } from '../hooks/useCteBatchWorkspace.hook'
import { createCteBatchDrafts } from '../shared/cteBatchDraft.service'
import { createCteBatchViewModel } from '../shared/cteBatchViewModel.service'

const SYNTHETIC_DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'

export function CteBatchWorkspacePage() {
  const drafts = createCteBatchDrafts()
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useCteBatchWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const selectedBatch =
    workspace.submitBatchMutation.data ??
    workspace.cancelBatchMutation.data ??
    workspace.batchesQuery.data?.items[0]
  const status =
    authQuery.isError || workspace.batchesQuery.isError || workspace.eventsQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          workspace.batchesQuery.isLoading ||
          workspace.eventsQuery.isLoading ||
          workspace.createBatchMutation.isPending ||
          workspace.submitBatchMutation.isPending ||
          workspace.cancelBatchMutation.isPending
        ? 'loading'
        : 'success'
  const viewModel = createCteBatchViewModel({
    ...(workspace.batchesQuery.data === undefined ? {} : { batches: workspace.batchesQuery.data }),
    ...(workspace.eventsQuery.data === undefined ? {} : { events: workspace.eventsQuery.data }),
    permissions,
    ...(selectedBatch === undefined ? {} : { selectedBatch }),
    status,
  })

  function handleCreateBatch(): void {
    void workspace.createBatchMutation.mutate(
      drafts.createBatchDraft({ documentIds: [SYNTHETIC_DOCUMENT_ID] }),
    )
  }

  function handleSubmitBatch(): void {
    if (viewModel.selectedBatchId !== undefined) {
      void workspace.submitBatchMutation.mutate(viewModel.selectedBatchId)
    }
  }

  function handleCancelBatch(): void {
    if (viewModel.selectedBatchId !== undefined) {
      void workspace.cancelBatchMutation.mutate(viewModel.selectedBatchId)
    }
  }

  return (
    <main>
      <h1>Workspace de CT-e</h1>
      {viewModel.status === 'forbidden' ? (
        <p role="alert">Seu acesso atual nao permite consultar este workspace.</p>
      ) : (
        <>
          <p role="status">{viewModel.status}</p>
          <section aria-labelledby="cte-document-title">
            <h2 id="cte-document-title">Documento elegivel para CT-e</h2>
            <p>{SYNTHETIC_DOCUMENT_ID}</p>
          </section>
          {viewModel.selectedBatch !== undefined && (
            <section aria-labelledby="cte-selected-batch-title">
              <h2 id="cte-selected-batch-title">Lote selecionado</h2>
              <p>{viewModel.selectedBatch.name}</p>
              <p>Status: {viewModel.selectedBatch.status}</p>
              <p>Itens: {viewModel.selectedBatch.itemCount}</p>
            </section>
          )}
          {workspace.canManageBatches && (
            <button
              disabled={workspace.createBatchMutation.isPending}
              onClick={handleCreateBatch}
              type="button"
            >
              Criar lote CT-e
            </button>
          )}
          {workspace.canSubmitBatches && (
            <button
              disabled={
                workspace.submitBatchMutation.isPending || !viewModel.canSubmitSelectedBatch
              }
              onClick={handleSubmitBatch}
              type="button"
            >
              Submeter lote CT-e
            </button>
          )}
          {workspace.canManageBatches && viewModel.selectedBatchId !== undefined && (
            <button
              disabled={workspace.cancelBatchMutation.isPending}
              onClick={handleCancelBatch}
              type="button"
            >
              Cancelar lote CT-e
            </button>
          )}
        </>
      )}
    </main>
  )
}
