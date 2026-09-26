/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T801: quando a tela precisa **reorganizar** o conteúdo (não só restilizar), a largura vem
 * de `matchMedia` com um dos breakpoints da casa (`docs/frontend/responsive.md`: 40, 64 ou 80rem).
 * Sem `window` (teste, render no servidor), a resposta é "largo": a página inteira, como sempre foi.
 */
import { useSyncExternalStore } from 'react'

export type LayoutBreakpoint = '40rem' | '64rem' | '80rem'

function queryOf(breakpoint: LayoutBreakpoint): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(`(min-width: ${breakpoint})`)
}

export function useMinWidth(breakpoint: LayoutBreakpoint): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = queryOf(breakpoint)
      query?.addEventListener('change', onChange)
      return () => query?.removeEventListener('change', onChange)
    },
    () => queryOf(breakpoint)?.matches ?? true,
    () => true,
  )
}
