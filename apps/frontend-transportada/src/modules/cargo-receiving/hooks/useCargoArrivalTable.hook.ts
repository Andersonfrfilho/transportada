/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoArrivalStatus } from '../shared/cargoArrival.types'
import {
  EMPTY_CARGO_ARRIVAL_TABLE_STATE,
  parseCargoArrivalTableState,
  serializeCargoArrivalTableState,
  toggleCargoArrivalSort,
  type CargoArrivalSortColumn,
  type CargoArrivalTableState,
} from '../shared/cargoArrivalTable.service'

export type CargoArrivalTableController = Readonly<{
  clearCriteria: () => void
  setContractors: (contractorIds: readonly string[]) => void
  setStatuses: (statuses: readonly CargoArrivalStatus[]) => void
  state: CargoArrivalTableState
  toggleSort: (column: CargoArrivalSortColumn) => void
}>

/**
 * `web.md` §7: filtros e ordenação moram na URL. A URL é escrita no próprio gesto, e não num efeito
 * depois dele: recarregar a página ou mandar o link reabre a mesma lista.
 */
export function useCargoArrivalTable(): CargoArrivalTableController {
  const [state, setState] = useState<CargoArrivalTableState>(() =>
    parseCargoArrivalTableState(window.location.search),
  )

  function commit(next: CargoArrivalTableState): void {
    setState(next)
    const search = serializeCargoArrivalTableState({ search: window.location.search, state: next })
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }

  return {
    clearCriteria: () => commit(EMPTY_CARGO_ARRIVAL_TABLE_STATE),
    setContractors: (contractorIds) => commit({ ...state, contractorIds }),
    setStatuses: (statuses) => commit({ ...state, statuses }),
    state,
    toggleSort: (column) =>
      commit({ ...state, sort: toggleCargoArrivalSort({ column, current: state.sort }) }),
  }
}
