/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cursor não volta sozinho: a API devolve só o próximo, então o caminho de ida fica guardado aqui
 * para o botão "anterior" existir sem pedir a página inteira de novo.
 */
export type CursorPageState = Readonly<{
  cursor: null | string
  history: readonly (null | string)[]
}>

export const FIRST_CURSOR_PAGE: CursorPageState = { cursor: null, history: [] }

export function nextCursorPage(state: CursorPageState, nextCursor: null | string): CursorPageState {
  if (nextCursor === null) return state
  return { cursor: nextCursor, history: [...state.history, state.cursor] }
}

export function previousCursorPage(state: CursorPageState): CursorPageState {
  const previousCursor = state.history.at(-1)
  if (previousCursor === undefined) return FIRST_CURSOR_PAGE
  return { cursor: previousCursor, history: state.history.slice(0, -1) }
}

export function canGoToPreviousCursorPage(state: CursorPageState): boolean {
  return state.history.length > 0
}
