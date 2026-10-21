/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107): as regras puras do "Vale para" do tipo de ocorrência — o problema que o editor mostra
 * antes de gravar (espelha a recusa da API), as opções do seletor múltiplo e o resumo do chip "Só: …".
 */
import type { MultiSelectOption } from '@/components/ui/multi-select'
import { formatTaxId } from '@/modules/shared/taxId.service'

import type { ContractorSummary } from './contractorSummary.service'
import {
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  type OccurrenceMoment,
  type OccurrenceTypeContractor,
  type OccurrenceTypeContractorScope,
} from './occurrence.constant'

export type ContractorScopeProblem = 'empty' | 'needsDocument'

/** Quantos nomes cabem no chip antes do "e mais N". */
const CONTRACTOR_SCOPE_CHIP_NAMES = 2

/** Tipo cujo único momento é a parada: ela não tem contratante, então o tipo não pode ser restrito (RF5). */
export function isStopOnly(moments: readonly OccurrenceMoment[]): boolean {
  return moments.length > 0 && moments.every((moment) => moment === 'stop')
}

/** Espelha a recusa da API (`validateOccurrenceTypeContractorScope`): o primeiro problema à vista. */
export function readContractorScopeProblem(
  input: Readonly<{
    contractorIds: readonly string[]
    moments: readonly OccurrenceMoment[]
    scope: OccurrenceTypeContractorScope
  }>,
): ContractorScopeProblem | null {
  if (input.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all) return null
  if (input.contractorIds.length === 0) return 'empty'
  return isStopOnly(input.moments) ? 'needsDocument' : null
}

function describeContractor(
  contractor: Pick<OccurrenceTypeContractor, 'displayName' | 'taxId'>,
  suffix: string,
): string {
  const name = `${contractor.displayName}${suffix}`
  return contractor.taxId === '' ? name : `${name} · ${formatTaxId(contractor.taxId)}`
}

/**
 * As contratantes cadastradas (já carregadas pela aba) e, junto, as do tipo: uma escolhida que caiu fora da
 * página carregada continua à vista com o nome que a API trouxe, e a inativa vem marcada.
 */
export function buildContractorScopeOptions(
  input: Readonly<{
    contractors: readonly ContractorSummary[]
    labels: Readonly<{ inactive: string }>
    selected: readonly OccurrenceTypeContractor[]
  }>,
): readonly MultiSelectOption[] {
  const selectedById = new Map(input.selected.map((contractor) => [contractor.id, contractor]))
  const fromDirectory = input.contractors.map((contractor) => {
    const stored = selectedById.get(contractor.id)
    const suffix = stored?.status === 'inactive' ? ` (${input.labels.inactive})` : ''
    return { label: describeContractor(contractor, suffix), value: contractor.id }
  })
  const known = new Set(fromDirectory.map((option) => option.value))
  const outside = input.selected
    .filter((contractor) => !known.has(contractor.id))
    .map((contractor) => ({
      label: describeContractor(
        contractor,
        contractor.status === 'inactive' ? ` (${input.labels.inactive})` : '',
      ),
      value: contractor.id,
    }))
  return [...fromDirectory, ...outside]
}

export type ContractorScopeSummary = Readonly<{
  fullNames: readonly string[]
  hiddenCount: number
  shownNames: readonly string[]
}>

/** O chip "Só: …" do catálogo: tipo geral (ou API anterior ao campo) não tem chip. */
export function summarizeContractorScope(
  input: Readonly<{
    contractors: readonly OccurrenceTypeContractor[] | undefined
    scope: OccurrenceTypeContractorScope | undefined
  }>,
): ContractorScopeSummary | null {
  if (input.scope !== OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed) return null
  const fullNames = (input.contractors ?? []).map((contractor) => contractor.displayName)
  return {
    fullNames,
    hiddenCount: Math.max(0, fullNames.length - CONTRACTOR_SCOPE_CHIP_NAMES),
    shownNames: fullNames.slice(0, CONTRACTOR_SCOPE_CHIP_NAMES),
  }
}
