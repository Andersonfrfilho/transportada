/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const readOnline = (): boolean => navigator.onLine !== false

/** O que o aparelho diz agora sobre a rede; reage a `online`/`offline` sem polling. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, readOnline, () => true)
}
