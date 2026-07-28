/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

const TICK_INTERVAL_MS = 1_000

type UseCountdownInput = Readonly<{
  targetIso: null | string | undefined
  onComplete?: (() => void) | undefined
}>

function remainingSecondsUntil(targetIso: null | string | undefined): number {
  if (targetIso === null || targetIso === undefined) return 0
  const target = Date.parse(targetIso)
  if (Number.isNaN(target)) return 0
  const remainingMs = target - Date.now()
  return remainingMs > 0 ? Math.ceil(remainingMs / TICK_INTERVAL_MS) : 0
}

export function useCountdown(input: UseCountdownInput): number {
  const { targetIso } = input
  const [remainingSeconds, setRemainingSeconds] = useState(() => remainingSecondsUntil(targetIso))
  const onCompleteRef = useRef(input.onComplete)
  onCompleteRef.current = input.onComplete

  useEffect(() => {
    setRemainingSeconds(remainingSecondsUntil(targetIso))
    if (remainingSecondsUntil(targetIso) === 0) {
      return
    }

    const interval = setInterval(() => {
      const next = remainingSecondsUntil(targetIso)
      setRemainingSeconds(next)
      if (next === 0) {
        clearInterval(interval)
        onCompleteRef.current?.()
      }
    }, TICK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [targetIso])

  return remainingSeconds
}
