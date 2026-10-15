/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

function readLocationKey(): string {
  return `${window.location.pathname}${window.location.search}`
}

/** A casca só re-renderiza quando a seção muda; ir da lista ao detalhe, ou trocar o filtro, muda só o caminho e a query. */
export function useDriverLocationKey(): string {
  return useSyncExternalStore(subscribe, readLocationKey)
}
