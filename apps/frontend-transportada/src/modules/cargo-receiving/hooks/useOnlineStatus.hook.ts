/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const readOnline = (): boolean => window.navigator.onLine
/** Sem janela (renderização no servidor) não há como estar offline. */
const readServerOnline = (): boolean => true

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, readOnline, readServerOnline)
}
