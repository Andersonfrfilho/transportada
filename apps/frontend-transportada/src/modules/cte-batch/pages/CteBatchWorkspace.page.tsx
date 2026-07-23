/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useCteBatchWorkspace } from '../hooks/useCteBatchWorkspace.hook'
import { createCteBatchDrafts } from '../shared/cteBatchDraft.service'
import { createCteBatchViewModel } from '../shared/cteBatchViewModel.service'
import type { CteBatchFilters } from '../shared/cteBatchClient.service'

const SYNTHETIC_DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'
const CTE_BATCH_ADVANCED_FILTERS: readonly (keyof CteBatchFilters)[] = [
  'itemCountEq',
  'itemCountNe',
  'itemCountGt',
  'itemCountGte',
  'itemCountLt',
  'itemCountLte',
  'versionEq',
  'versionNe',
  'versionGt',
  'versionGte',
  'versionLt',
  'versionLte',
  'createdFrom',
  'createdUntil',
  'updatedFrom',
  'updatedUntil',
]

function advancedFilter(
  input: Readonly<{ key: keyof CteBatchFilters | ''; value: string }>,
): Partial<CteBatchFilters> {
  if (input.key === '' || input.value.trim() === '') return {}
  return { [input.key]: input.value.trim() }
}

export function CteBatchWorkspacePage() {
  const drafts = createCteBatchDrafts()
  const authQuery = useAuthMeQuery()
  const [nameContains, setNameContains] = useState('')
  const [statusEq, setStatusEq] = useState<
    '' | 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'
  >('')
  const [statusNe, setStatusNe] = useState<
    '' | 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'
  >('')
  const [advancedFilterKey, setAdvancedFilterKey] = useState<keyof CteBatchFilters | ''>('')
  const [advancedFilterValue, setAdvancedFilterValue] = useState('')

  const clearFilters = (): void => {
    setNameContains('')
    setStatusEq('')
    setStatusNe('')
    setAdvancedFilterKey('')
    setAdvancedFilterValue('')
  }
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useCteBatchWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    filters: {
      ...(nameContains === '' ? {} : { nameContains }),
      ...(statusEq === '' ? {} : { statusEq }),
      ...(statusNe === '' ? {} : { statusNe }),
      ...advancedFilter({ key: advancedFilterKey, value: advancedFilterValue }),
    },
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
          <section aria-labelledby="cte-batch-filters-title">
            <h2 id="cte-batch-filters-title">Filtros</h2>
            <label>
              Nome do lote
              <input
                onChange={(event) => setNameContains(event.target.value)}
                type="search"
                value={nameContains}
              />
            </label>
            <label>
              Status do lote
              <select
                onChange={(event) =>
                  setStatusEq(
                    event.target.value as
                      | ''
                      | 'cancelled'
                      | 'done'
                      | 'draft'
                      | 'error'
                      | 'in_flight'
                      | 'submitted',
                  )
                }
                value={statusEq}
              >
                <option value="">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="submitted">Submetido</option>
                <option value="in_flight">Em processamento</option>
                <option value="done">Concluído</option>
                <option value="error">Erro</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <label>
              Status diferente de
              <select
                onChange={(event) =>
                  setStatusNe(
                    event.target.value as
                      | ''
                      | 'cancelled'
                      | 'done'
                      | 'draft'
                      | 'error'
                      | 'in_flight'
                      | 'submitted',
                  )
                }
                value={statusNe}
              >
                <option value="">Nenhum</option>
                <option value="draft">Rascunho</option>
                <option value="submitted">Submetido</option>
                <option value="in_flight">Em processamento</option>
                <option value="done">Concluído</option>
                <option value="error">Erro</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <label>
              Filtro avançado
              <select
                onChange={(event) =>
                  setAdvancedFilterKey(event.target.value as keyof CteBatchFilters | '')
                }
                value={advancedFilterKey}
              >
                <option value="">Nenhum</option>
                {CTE_BATCH_ADVANCED_FILTERS.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor do filtro avançado
              <input
                onChange={(event) => setAdvancedFilterValue(event.target.value)}
                type="text"
                value={advancedFilterValue}
              />
            </label>
            <button onClick={clearFilters} type="button">
              Limpar filtros
            </button>
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
          {viewModel.batches !== undefined && (
            <section aria-labelledby="cte-batch-list-title">
              <h2 id="cte-batch-list-title">Lotes carregados</h2>
              {viewModel.batches.map((batch) => (
                <p key={batch.id}>
                  {batch.name} · {batch.status} · {batch.itemCount}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  )
}
