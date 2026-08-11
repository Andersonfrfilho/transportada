/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { createFreightDrafts } from '../shared/freightDraft.service'
import { createFreightViewModel } from '../shared/freightViewModel.service'
import { useFreightWorkspace } from '../hooks/useFreightWorkspace.hook'
import type { FreightCalculationFilters, FreightRuleFilters } from '../shared/freightClient.service'

const SYNTHETIC_DOCUMENT_ID = '00000000-0000-4000-8000-000000000304'
const FREIGHT_RULES_SKELETON_ROW_COUNT = 4
const FREIGHT_WORKSPACE_STATUS_LABEL = {
  adjusted: 'Ajustado',
  empty: 'Sem documentos',
  error: 'Indisponível',
  forbidden: 'Sem acesso',
  loading: 'Carregando',
  ready: 'Pronto',
} as const
const FREIGHT_RULE_STATUS_OPTIONS = [
  { label: 'Ativa', value: 'active' },
  { label: 'Rascunho', value: 'draft' },
  { label: 'Inativa', value: 'inactive' },
] as const
const FREIGHT_CALCULATION_STATUS_OPTIONS = [
  { label: 'Snapshot', value: 'snapshotted' },
  { label: 'Rejeitado', value: 'rejected' },
] as const
const FREIGHT_RULE_ADVANCED_FILTERS: readonly (keyof FreightRuleFilters)[] = [
  'descriptionContains',
  'minimumAmountEq',
  'minimumAmountNe',
  'minimumAmountGt',
  'minimumAmountGte',
  'minimumAmountLt',
  'minimumAmountLte',
  'maximumAmountEq',
  'maximumAmountNe',
  'maximumAmountGt',
  'maximumAmountGte',
  'maximumAmountLt',
  'maximumAmountLte',
  'percentageEq',
  'percentageNe',
  'percentageGt',
  'percentageGte',
  'percentageLt',
  'percentageLte',
  'priorityEq',
  'priorityNe',
  'priorityGt',
  'priorityGte',
  'priorityLt',
  'priorityLte',
  'currentVersionEq',
  'currentVersionNe',
  'createdFrom',
  'createdUntil',
  'updatedFrom',
  'updatedUntil',
  'validFromFrom',
  'validFromUntil',
  'validUntilFrom',
  'validUntilUntil',
  'validUntilIsNull',
  'typeEq',
  'typeNe',
]
const FREIGHT_CALCULATION_ADVANCED_FILTERS: readonly (keyof FreightCalculationFilters)[] = [
  'baseAmountEq',
  'baseAmountNe',
  'baseAmountGt',
  'baseAmountGte',
  'baseAmountLt',
  'baseAmountLte',
  'calculatedAmountEq',
  'calculatedAmountNe',
  'calculatedAmountGt',
  'calculatedAmountGte',
  'calculatedAmountLt',
  'calculatedAmountLte',
  'minimumAmountEq',
  'minimumAmountNe',
  'minimumAmountGt',
  'minimumAmountGte',
  'minimumAmountLt',
  'minimumAmountLte',
  'maximumAmountEq',
  'maximumAmountNe',
  'maximumAmountGt',
  'maximumAmountGte',
  'maximumAmountLt',
  'maximumAmountLte',
  'totalAmountEq',
  'totalAmountNe',
  'totalAmountGt',
  'totalAmountGte',
  'totalAmountLt',
  'totalAmountLte',
  'percentageEq',
  'percentageNe',
  'percentageGt',
  'percentageGte',
  'percentageLt',
  'percentageLte',
  'ruleVersionEq',
  'ruleVersionNe',
  'freightRuleIdEq',
  'freightRuleIdNe',
  'freightRuleVersionIdEq',
  'freightRuleVersionIdNe',
  'createdFrom',
  'createdUntil',
  'updatedFrom',
  'updatedUntil',
]

function advancedFilter<T extends Record<string, unknown>>(
  input: Readonly<{ key: keyof T | ''; value: string }>,
): Partial<T> {
  if (input.key === '' || input.value.trim() === '') return {}
  if (input.key === 'validUntilIsNull') {
    return { [input.key]: input.value === 'true' } as Partial<T>
  }
  return { [input.key]: input.value.trim() } as Partial<T>
}

export function FreightWorkspacePage() {
  const drafts = createFreightDrafts()
  const authQuery = useAuthMeQuery()
  const [ruleStatusEq, setRuleStatusEq] = useState<'' | 'active' | 'draft' | 'inactive'>('')
  const [ruleStatusNe, setRuleStatusNe] = useState<'' | 'active' | 'draft' | 'inactive'>('')
  const [ruleNameContains, setRuleNameContains] = useState('')
  const [calculationStatusEq, setCalculationStatusEq] = useState<'' | 'rejected' | 'snapshotted'>(
    '',
  )
  const [calculationStatusNe, setCalculationStatusNe] = useState<'' | 'rejected' | 'snapshotted'>(
    '',
  )
  const [advancedRuleFilterKey, setAdvancedRuleFilterKey] = useState<keyof FreightRuleFilters | ''>(
    '',
  )
  const [advancedRuleFilterValue, setAdvancedRuleFilterValue] = useState('')
  const [advancedCalculationFilterKey, setAdvancedCalculationFilterKey] = useState<
    keyof FreightCalculationFilters | ''
  >('')
  const [advancedCalculationFilterValue, setAdvancedCalculationFilterValue] = useState('')

  const clearFilters = (): void => {
    setRuleNameContains('')
    setRuleStatusEq('')
    setRuleStatusNe('')
    setCalculationStatusEq('')
    setCalculationStatusNe('')
    setAdvancedRuleFilterKey('')
    setAdvancedRuleFilterValue('')
    setAdvancedCalculationFilterKey('')
    setAdvancedCalculationFilterValue('')
  }
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useFreightWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    calculationFilters: {
      ...(calculationStatusEq === '' ? {} : { statusEq: calculationStatusEq }),
      ...(calculationStatusNe === '' ? {} : { statusNe: calculationStatusNe }),
      ...advancedFilter<FreightCalculationFilters>({
        key: advancedCalculationFilterKey,
        value: advancedCalculationFilterValue,
      }),
    },
    ...(companyId === undefined ? {} : { documentId: SYNTHETIC_DOCUMENT_ID }),
    permissions,
    ruleFilters: {
      ...(ruleNameContains === '' ? {} : { nameContains: ruleNameContains }),
      ...(ruleStatusEq === '' ? {} : { statusEq: ruleStatusEq }),
      ...(ruleStatusNe === '' ? {} : { statusNe: ruleStatusNe }),
      ...advancedFilter<FreightRuleFilters>({
        key: advancedRuleFilterKey,
        value: advancedRuleFilterValue,
      }),
    },
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
    <main className="workspace-shell">
      <header className="workspace-hero">
        <div>
          <p className="workspace-kicker">Motor de precificação</p>
          <h1>Workspace de frete</h1>
          <p className="workspace-intro">
            Parametrize regras, simule cenários e acompanhe o cálculo aplicado sobre documentos
            elegíveis sem sair do módulo.
          </p>
        </div>
        <div className="workspace-status-card">
          <span>Status</span>
          <strong>{FREIGHT_WORKSPACE_STATUS_LABEL[viewModel.status]}</strong>
          <p className="workspace-status-text">Regras, simulação e filtros em uma mesma leitura.</p>
        </div>
      </header>
      {viewModel.status === 'forbidden' ? (
        <p className="workspace-boundary" role="alert">
          Seu acesso atual nao permite consultar este workspace.
        </p>
      ) : (
        <div className="workspace-grid">
          <section className="workspace-panel" aria-labelledby="freight-document-title">
            <h2 id="freight-document-title">NF-e elegivel</h2>
            <p>{viewModel.selectedDocumentId ?? SYNTHETIC_DOCUMENT_ID}</p>
          </section>
          <section
            className="workspace-panel workspace-panel-full"
            aria-labelledby="freight-filters-title"
          >
            <h2 id="freight-filters-title">Filtros</h2>
            <div className="workspace-filter-grid">
              <label>
                Nome da regra
                <input
                  onChange={(event) => setRuleNameContains(event.target.value)}
                  type="search"
                  value={ruleNameContains}
                />
              </label>
              <label>
                Regra com status
                <Select
                  ariaLabel="Regra com status"
                  clearable
                  compact
                  options={FREIGHT_RULE_STATUS_OPTIONS}
                  placeholder="Todos"
                  value={ruleStatusEq}
                  onChange={(value) =>
                    setRuleStatusEq(value as '' | 'active' | 'draft' | 'inactive')
                  }
                />
              </label>
              <label>
                Regra com status diferente de
                <Select
                  ariaLabel="Regra com status diferente de"
                  clearable
                  compact
                  options={FREIGHT_RULE_STATUS_OPTIONS}
                  placeholder="Nenhum"
                  value={ruleStatusNe}
                  onChange={(value) =>
                    setRuleStatusNe(value as '' | 'active' | 'draft' | 'inactive')
                  }
                />
              </label>
              <label>
                Cálculo com status
                <Select
                  ariaLabel="Cálculo com status"
                  clearable
                  compact
                  options={FREIGHT_CALCULATION_STATUS_OPTIONS}
                  placeholder="Todos"
                  value={calculationStatusEq}
                  onChange={(value) =>
                    setCalculationStatusEq(value as '' | 'rejected' | 'snapshotted')
                  }
                />
              </label>
              <label>
                Cálculo com status diferente de
                <Select
                  ariaLabel="Cálculo com status diferente de"
                  clearable
                  compact
                  options={FREIGHT_CALCULATION_STATUS_OPTIONS}
                  placeholder="Nenhum"
                  value={calculationStatusNe}
                  onChange={(value) =>
                    setCalculationStatusNe(value as '' | 'rejected' | 'snapshotted')
                  }
                />
              </label>
              <label>
                Filtro avançado de regra
                <Select
                  ariaLabel="Filtro avançado de regra"
                  clearable
                  compact
                  options={FREIGHT_RULE_ADVANCED_FILTERS.map((filter) => ({
                    label: filter,
                    value: filter,
                  }))}
                  placeholder="Nenhum"
                  value={advancedRuleFilterKey}
                  onChange={(value) =>
                    setAdvancedRuleFilterKey(value as keyof FreightRuleFilters | '')
                  }
                />
              </label>
              <label>
                Valor do filtro de regra
                <input
                  onChange={(event) => setAdvancedRuleFilterValue(event.target.value)}
                  type="text"
                  value={advancedRuleFilterValue}
                />
              </label>
              <label>
                Filtro avançado de cálculo
                <Select
                  ariaLabel="Filtro avançado de cálculo"
                  clearable
                  compact
                  options={FREIGHT_CALCULATION_ADVANCED_FILTERS.map((filter) => ({
                    label: filter,
                    value: filter,
                  }))}
                  placeholder="Nenhum"
                  value={advancedCalculationFilterKey}
                  onChange={(value) =>
                    setAdvancedCalculationFilterKey(value as keyof FreightCalculationFilters | '')
                  }
                />
              </label>
              <label>
                Valor do filtro de cálculo
                <input
                  onChange={(event) => setAdvancedCalculationFilterValue(event.target.value)}
                  type="text"
                  value={advancedCalculationFilterValue}
                />
              </label>
            </div>
            <div className="workspace-actions">
              <button className="workspace-secondary-action" onClick={clearFilters} type="button">
                <Icon name="filter-clear" />
                Limpar filtros
              </button>
              {workspace.canManageRules && (
                <button
                  className="workspace-primary-action"
                  disabled={workspace.createRuleMutation.isPending}
                  onClick={handleCreateDefaultRule}
                  type="button"
                >
                  <Icon name="add" />
                  Criar regra padrao
                </button>
              )}
              {workspace.canSimulateFreight && (
                <button
                  className="workspace-secondary-action"
                  disabled={workspace.simulateMutation.isPending}
                  onClick={handleSimulateFreight}
                  type="button"
                >
                  <Icon name="refresh" />
                  Simular frete
                </button>
              )}
            </div>
          </section>
          {workspace.simulateMutation.isPending ? (
            <section className="workspace-panel" aria-labelledby="freight-result-title">
              <h2 id="freight-result-title">Resultado da simulacao</h2>
              <SkeletonGroup label="Calculando simulação">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="45%" />
              </SkeletonGroup>
            </section>
          ) : (
            viewModel.simulation !== undefined && (
              <section className="workspace-panel" aria-labelledby="freight-result-title">
                <h2 id="freight-result-title">Resultado da simulacao</h2>
                <p>Total calculado: {viewModel.simulation.totalAmount}</p>
                {viewModel.hasAdjustment ? (
                  <p>Ajuste aplicado: {viewModel.simulation.adjustments[0]?.description}</p>
                ) : (
                  <p>Sem ajuste de minimo ou maximo.</p>
                )}
              </section>
            )
          )}
          {workspace.rulesQuery.isLoading ? (
            <section className="workspace-panel" aria-labelledby="freight-rules-title">
              <h2 id="freight-rules-title">Regras carregadas</h2>
              <SkeletonGroup className="workspace-list" label="Carregando regras">
                {Array.from({ length: FREIGHT_RULES_SKELETON_ROW_COUNT }, (_, index) => (
                  <div className="workspace-skeleton-row" key={index}>
                    <Skeleton variant="text" width="55%" />
                    <Skeleton variant="text" width="30%" />
                  </div>
                ))}
              </SkeletonGroup>
            </section>
          ) : (
            viewModel.rules !== undefined && (
              <section className="workspace-panel" aria-labelledby="freight-rules-title">
                <h2 id="freight-rules-title">Regras carregadas</h2>
                <ul className="workspace-list">
                  {viewModel.rules.map((rule) => (
                    <li key={rule.id}>
                      <strong>{rule.name}</strong>
                      <p>{rule.status}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )
          )}
        </div>
      )}
    </main>
  )
}
