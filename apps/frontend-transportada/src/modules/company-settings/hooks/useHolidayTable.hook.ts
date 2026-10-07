/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { HolidayKind, HolidayRecurrence } from '../shared/businessCalendar.types'
import {
  EMPTY_HOLIDAY_TABLE_STATE,
  parseHolidayTableState,
  serializeHolidayTableState,
  toggleHolidaySort,
  type HolidaySortColumn,
  type HolidayTableState,
} from '../shared/businessCalendarTable.service'

const FIRST_PAGE = 1

/**
 * `web.md` §7: filtro, ordenação e página moram na URL. A URL é escrita no próprio gesto, e não num efeito depois
 * dele: recarregar a página ou mandar o link reabre a mesma tabela. Cada tabela tem o prefixo dela, e o que é de
 * outro dono (a aba, a outra tabela) fica como está.
 */
export function useHolidayTable(prefix: string) {
  const [state, setState] = useState<HolidayTableState>(() =>
    parseHolidayTableState({ prefix, search: window.location.search }),
  )

  function commit(next: HolidayTableState): void {
    setState(next)
    const search = serializeHolidayTableState({
      prefix,
      search: window.location.search,
      state: next,
    })
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }

  /** Critério novo recomeça da primeira página: a de antes pode nem existir mais. */
  function change(patch: Partial<HolidayTableState>): void {
    commit({ ...state, ...patch, page: FIRST_PAGE })
  }

  return {
    clearCriteria: () => commit(EMPTY_HOLIDAY_TABLE_STATE),
    setKinds: (kinds: readonly HolidayKind[]) => change({ kinds }),
    setPage: (page: number) => commit({ ...state, page }),
    setRecurrences: (recurrences: readonly HolidayRecurrence[]) => change({ recurrences }),
    setStates: (states: readonly string[]) => change({ states }),
    state,
    toggleSort: (column: HolidaySortColumn) =>
      change({ sort: toggleHolidaySort({ column, current: state.sort }) }),
  }
}

export type HolidayTableController = ReturnType<typeof useHolidayTable>
