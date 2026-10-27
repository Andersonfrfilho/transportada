/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  parseStopViewMode,
  STOP_VIEW_MODE_STORAGE_KEY,
  type StopViewMode,
} from '../shared/stopPaging.service'

function readMode(): StopViewMode {
  try {
    return parseStopViewMode(window.localStorage.getItem(STOP_VIEW_MODE_STORAGE_KEY))
  } catch {
    return 'paged'
  }
}

/** A escolha do motorista, guardada no aparelho; sem armazenamento (modo privado) vale só nesta sessão. */
export function useStopViewMode(): Readonly<{
  mode: StopViewMode
  setMode: (mode: StopViewMode) => void
}> {
  const [mode, setModeState] = useState(readMode)
  return {
    mode,
    setMode: (next) => {
      setModeState(next)
      try {
        window.localStorage.setItem(STOP_VIEW_MODE_STORAGE_KEY, next)
      } catch {
        /* sem armazenamento: a escolha vale só nesta sessão */
      }
    },
  }
}
