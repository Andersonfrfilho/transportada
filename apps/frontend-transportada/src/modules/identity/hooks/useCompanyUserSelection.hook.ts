/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CompanyUser } from '../shared/companyUsers.types'

export type CompanyUserSelectionState = {
  readonly areAllSelected: boolean
  readonly hasSelection: boolean
  readonly isPartiallySelected: boolean
  readonly selectedIds: readonly string[]
  clear: () => void
  isSelected: (userId: string) => boolean
  toggle: (userId: string, selected: boolean) => void
  toggleAll: (selected: boolean) => void
}

/**
 * A seleção é da página que está na frente do operador, e some quando ele muda de página: manter
 * escolhidos que saíram da tela produz um lote que ninguém consegue conferir antes de aplicar.
 *
 * `selectedIds` sai na ordem da página, não na ordem dos cliques — é assim que as pills batem com o
 * que a pessoa está vendo.
 */
export function useCompanyUserSelection(users: readonly CompanyUser[]): CompanyUserSelectionState {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const visibleIds = users.map((user) => user.id)
  const selectedIds = visibleIds.filter((userId) => selected.has(userId))
  const areAllSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length

  return {
    areAllSelected,
    clear: () => setSelected(new Set()),
    hasSelection: selectedIds.length > 0,
    isPartiallySelected: selectedIds.length > 0 && !areAllSelected,
    isSelected: (userId) => selected.has(userId),
    selectedIds,
    toggle: (userId, isChecked) =>
      setSelected((current) => {
        const next = new Set(current)
        if (isChecked) next.add(userId)
        else next.delete(userId)
        return next
      }),
    /** Marcar tudo age só sobre a página: o "todos" que a pessoa vê é o que ela pode conferir. */
    toggleAll: (isChecked) => setSelected(isChecked ? new Set(visibleIds) : new Set()),
  }
}
