/* Copyright (c) 2026 Ada Technology. MIT License. */

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { createFreightDrafts } from '../shared/freightDraft.service'
import { createFreightViewModel } from '../shared/freightViewModel.service'
import { useFreightWorkspace } from '../hooks/useFreightWorkspace.hook'

const SYNTHETIC_DOCUMENT_ID = '00000000-0000-4000-8000-000000000304'

export function FreightWorkspacePage() {
  const drafts = createFreightDrafts()
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useFreightWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    ...(companyId === undefined ? {} : { documentId: SYNTHETIC_DOCUMENT_ID }),
    permissions,
  })
  const status =
    authQuery.isError || workspace.rulesQuery.isError || workspace.calculationsQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          workspace.rulesQuery.isLoading ||
          workspace.calculationsQuery.isLoading
        ? 'loading'
        : 'success'
  const calculations =
    workspace.simulateMutation.data === undefined
      ? workspace.calculationsQuery.data
      : { items: [workspace.simulateMutation.data], nextCursor: null }
  const viewModel = createFreightViewModel({
    ...(calculations === undefined ? {} : { calculations }),
    documents: [
      {
        id: SYNTHETIC_DOCUMENT_ID,
        issuedAt: '2026-07-22T10:00:00.000Z',
        label: '35190730290856000160550010000000011000000010',
        status: 'authorized',
        totalAmount: '10000.0000',
        variant: 'complete',
      },
    ],
    permissions,
    ...(workspace.rulesQuery.data === undefined ? {} : { rules: workspace.rulesQuery.data }),
    ...(workspace.simulateMutation.data === undefined
      ? {}
      : { simulation: workspace.simulateMutation.data }),
    status,
  })

  function handleCreateDefaultRule(): void {
    void workspace.createRuleMutation.mutate(drafts.createRuleDraft())
  }

  function handleSimulateFreight(): void {
    void workspace.simulateMutation.mutate(
      drafts.createSimulationDraft({ documentId: SYNTHETIC_DOCUMENT_ID }),
    )
  }

  return (
    <main>
      <h1>Workspace de frete</h1>
      {viewModel.status === 'forbidden' ? (
        <p role="alert">Seu acesso atual nao permite consultar este workspace.</p>
      ) : (
        <>
          <p role="status">{viewModel.status}</p>
          <section aria-labelledby="freight-document-title">
            <h2 id="freight-document-title">NF-e elegivel</h2>
            <p>{viewModel.selectedDocumentId ?? SYNTHETIC_DOCUMENT_ID}</p>
          </section>
          {workspace.canManageRules && (
            <button
              disabled={workspace.createRuleMutation.isPending}
              onClick={handleCreateDefaultRule}
              type="button"
            >
              Criar regra padrao
            </button>
          )}
          {workspace.canSimulateFreight && (
            <button
              disabled={workspace.simulateMutation.isPending}
              onClick={handleSimulateFreight}
              type="button"
            >
              Simular frete
            </button>
          )}
          {viewModel.simulation !== undefined && (
            <section aria-labelledby="freight-result-title">
              <h2 id="freight-result-title">Resultado da simulacao</h2>
              <p>Total calculado: {viewModel.simulation.totalAmount}</p>
              {viewModel.hasAdjustment ? (
                <p>Ajuste aplicado: {viewModel.simulation.adjustments[0]?.description}</p>
              ) : (
                <p>Sem ajuste de minimo ou maximo.</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
