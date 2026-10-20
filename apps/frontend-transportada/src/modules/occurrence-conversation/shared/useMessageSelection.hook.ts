/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useState } from 'react'

import {
  toggleSelected,
  type MessageSelection,
  type SelectableMessage,
} from './messageSelection.service'

const EMPTY: MessageSelection = new Map()

export type MessageSelectionState = Readonly<{
  clear: () => void
  selected: MessageSelection
  toggle: (message: SelectableMessage) => void
}>

/**
 * As mensagens marcadas de um chat. Clicar no balão marca; com uma marcada aparecem as opções dela, com duas ou
 * mais aparece a barra que age sobre todas. Esc desmarca tudo, como em qualquer seleção do sistema.
 */
export function useMessageSelection(): MessageSelectionState {
  const [selected, setSelected] = useState<MessageSelection>(EMPTY)
  const clear = useCallback(() => setSelected(EMPTY), [])
  const hasSelection = selected.size > 0

  useEffect(() => {
    if (!hasSelection) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') clear()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hasSelection, clear])

  return {
    clear,
    selected,
    toggle: (message) => setSelected((current) => toggleSelected(current, message)),
  }
}
