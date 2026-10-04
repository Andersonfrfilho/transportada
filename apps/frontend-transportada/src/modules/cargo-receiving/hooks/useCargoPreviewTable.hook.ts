/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoPreviewStatus } from '../shared/cargoPreview.types'
import {
  EMPTY_CARGO_PREVIEW_TABLE_STATE,
  parseCargoPreviewTableState,
  serializeCargoPreviewTableState,
  toggleCargoPreviewSort,
  type CargoPreviewSortColumn,
  type CargoPreviewTableState,
} from '../shared/cargoPreviewTable.service'

export type CargoPreviewTableController = Readonly<{
  clearCriteria: () => void
  setContractors: (contractorIds: readonly string[]) => void
  setStatuses: (statuses: readonly CargoPreviewStatus[]) => void
  state: CargoPreviewTableState
  toggleSort: (column: CargoPreviewSortColumn) => void
}>

/**
 * `web.md` §7: filtros e ordenação moram na URL, escrita no próprio gesto (e não num efeito depois dele):
 * recarregar a página ou mandar o link reabre a mesma lista.
 */
export function useCargoPreviewTable(): CargoPreviewTableController {
  const [state, setState] = useState<CargoPreviewTableState>(() =>
    parseCargoPreviewTableState(window.location.search),
  )

  function commit(next: CargoPreviewTableState): void {
    setState(next)
    const search = serializeCargoPreviewTableState({ search: window.location.search, state: next })
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }

  return {
    clearCriteria: () => commit(EMPTY_CARGO_PREVIEW_TABLE_STATE),
    setContractors: (contractorIds) => commit({ ...state, contractorIds }),
    setStatuses: (statuses) => commit({ ...state, statuses }),
    state,
    toggleSort: (column) =>
      commit({ ...state, sort: toggleCargoPreviewSort({ column, current: state.sort }) }),
  }
}
