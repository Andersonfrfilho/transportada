/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  EMPTY_CONTRACTOR_TABLE_STATE,
  parseContractorTableState,
  serializeContractorTableState,
  toggleContractorSort,
  type ContractorSortColumn,
  type ContractorTableState,
} from '../shared/contractorTable.service'
import type { ContractorStatus } from '../shared/contractorDirectory.types'

export type ContractorTableController = Readonly<{
  clearCriteria: () => void
  setQuery: (query: string) => void
  setStatuses: (statuses: readonly ContractorStatus[]) => void
  state: ContractorTableState
  toggleSort: (column: ContractorSortColumn) => void
}>

/**
 * `web.md` §7: busca, situação e ordenação moram na URL. A URL é escrita no próprio gesto, e não num
 * efeito depois dele: recarregar a página ou mandar o link reabre a mesma lista.
 */
export function useContractorTable(): ContractorTableController {
  const [state, setState] = useState<ContractorTableState>(() =>
    parseContractorTableState(window.location.search),
  )

  function commit(next: ContractorTableState): void {
    setState(next)
    const search = serializeContractorTableState({ search: window.location.search, state: next })
    window.history.replaceState(window.history.state, '', search)
  }

  return {
    clearCriteria: () => commit(EMPTY_CONTRACTOR_TABLE_STATE),
    setQuery: (query) => commit({ ...state, query }),
    setStatuses: (statuses) => commit({ ...state, statuses }),
    state,
    toggleSort: (column) =>
      commit({ ...state, sort: toggleContractorSort({ column, current: state.sort }) }),
  }
}
