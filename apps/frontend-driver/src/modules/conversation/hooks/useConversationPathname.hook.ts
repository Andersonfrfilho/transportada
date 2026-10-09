/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

function readPathname(): string {
  return window.location.pathname
}

/**
 * A casca só re-renderiza quando a *seção* muda; ir da lista para uma conversa continua em
 * `conversations`, então a página lê o caminho por conta própria.
 */
export function useConversationPathname(): string {
  return useSyncExternalStore(subscribe, readPathname)
}
