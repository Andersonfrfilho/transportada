/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import {
  applyNfseConditionChanges,
  createNfseAdvancedFilterModel,
  createNfseCondition,
  createNfseConditionGroup,
  type NfseAdvancedFilter,
  type NfseCondition,
  type NfseConditionGroup,
} from '../shared/nfseInvoiceAdvancedFilter.service'

export type NfseAdvancedFilterControls = ReturnType<typeof useNfseAdvancedFilterModel>

/**
 * O identificador da condição vem de um contador, não de `crypto.randomUUID()`: ele é chave de
 * lista e precisa sobreviver a cada render sem virar outro.
 */
export function useNfseAdvancedFilterModel(onChange: () => void) {
  const sequence = useRef(0)
  const nextId = (): string => {
    sequence.current += 1
    return `nfse-condition-${sequence.current}`
  }
  const [model, setModel] = useState<NfseAdvancedFilter>(() =>
    createNfseAdvancedFilterModel(nextId),
  )

  function changeModel(update: (current: NfseAdvancedFilter) => NfseAdvancedFilter): void {
    setModel(update)
    onChange()
  }

  function changeGroup(
    groupId: string,
    update: (group: NfseConditionGroup) => NfseConditionGroup,
  ): void {
    changeModel((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? update(group) : group)),
    }))
  }

  return {
    addConditionGroup: () =>
      changeModel((current) => ({
        ...current,
        groups: [...current.groups, createNfseConditionGroup(nextId)],
      })),
    addGroupCondition: (groupId: string) =>
      changeGroup(groupId, (group) => ({
        ...group,
        conditions: [...group.conditions, createNfseCondition(nextId())],
      })),
    changeCondition: (groupId: string, conditionId: string, changes: Partial<NfseCondition>) =>
      changeGroup(groupId, (group) => ({
        ...group,
        conditions: group.conditions.map((condition) =>
          condition.id === conditionId ? applyNfseConditionChanges(condition, changes) : condition,
        ),
      })),
    model,
    /** O grupo único não sai: sem nenhum, o construtor viraria uma caixa vazia sem ação possível. */
    removeConditionGroup: (groupId: string) =>
      changeModel((current) =>
        current.groups.length === 1
          ? current
          : { ...current, groups: current.groups.filter((group) => group.id !== groupId) },
      ),
    removeGroupCondition: (groupId: string, conditionId: string) =>
      changeGroup(groupId, (group) =>
        group.conditions.length === 1
          ? group
          : {
              ...group,
              conditions: group.conditions.filter((condition) => condition.id !== conditionId),
            },
      ),
    setGroupConnector: (groupId: string, connector: 'and' | 'or') =>
      changeGroup(groupId, (group) => ({ ...group, connector })),
    setModelConnector: (connector: 'and' | 'or') =>
      changeModel((current) => ({ ...current, connector })),
  }
}
