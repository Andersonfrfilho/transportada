/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { resolveCargoLayoutElapsedMs } from '../shared/cargoLayoutElapsed.service'

const TICK_MS = 1_000

type UseCargoLayoutElapsedParams = Readonly<{
  readNow?: () => number
  since: number | undefined
}>

/** Tempo desde o começo do episódio de `pending`, a cada segundo. Sem episódio, `undefined`. */
export function useCargoLayoutElapsed({
  readNow = Date.now,
  since,
}: UseCargoLayoutElapsedParams): number | undefined {
  const [now, setNow] = useState(readNow)

  useEffect(() => {
    if (since === undefined) return undefined
    setNow(readNow())
    const interval = setInterval(() => {
      setNow(readNow())
    }, TICK_MS)
    return () => {
      clearInterval(interval)
    }
  }, [readNow, since])

  if (since === undefined) return undefined
  return resolveCargoLayoutElapsedMs({ now, since })
}
