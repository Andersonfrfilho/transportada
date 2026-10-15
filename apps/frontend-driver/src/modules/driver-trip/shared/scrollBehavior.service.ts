/* Copyright (c) 2026 Ada Technology. MIT License. */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Rolagem suave por padrão; quem pediu movimento reduzido recebe o salto direto. */
export function resolveScrollBehavior(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia,
): ScrollBehavior {
  if (matchMedia === undefined) return 'smooth'
  return matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth'
}
