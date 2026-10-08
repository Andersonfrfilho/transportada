/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEffect, useState } from 'react'

/** O valor só assenta depois de `delayMs` sem mudar; o primeiro valor vale já. */
export function useDebouncedValue(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, value])
  return settled
}
