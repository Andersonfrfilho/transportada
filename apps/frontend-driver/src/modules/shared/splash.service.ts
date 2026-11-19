/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O id do elemento que o `index.html` entrega no primeiro quadro. */
export const SPLASH_ELEMENT_ID = 'splash'
/** A animação de entrada dura 650 ms; o mínimo evita a splash piscar e sumir antes de ser lida. */
export const SPLASH_MINIMUM_VISIBLE_MS = 600
export const SPLASH_FADE_OUT_MS = 250

interface SplashHost {
  readonly document: Pick<Document, 'getElementById'>
  readonly elapsedMs: () => number
  readonly prefersReducedMotion: () => boolean
  readonly schedule: (callback: () => void, delayMs: number) => void
}

/**
 * Tira a splash da frente quando o app já montou. Ela nunca segura o uso: o mínimo conta desde a
 * abertura da página (não desde a chamada) e, com `prefers-reduced-motion`, não há mínimo nem fade.
 */
export function dismissSplash(host: SplashHost): void {
  const splash = host.document.getElementById(SPLASH_ELEMENT_ID)
  if (splash === null) return

  if (host.prefersReducedMotion()) {
    splash.remove()
    return
  }

  const wait = Math.max(0, SPLASH_MINIMUM_VISIBLE_MS - host.elapsedMs())
  host.schedule(() => {
    splash.classList.add('is-leaving')
    host.schedule(() => splash.remove(), SPLASH_FADE_OUT_MS)
  }, wait)
}

export function dismissSplashInBrowser(): void {
  dismissSplash({
    document,
    elapsedMs: () => performance.now(),
    prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    schedule: (callback, delayMs) => {
      window.setTimeout(callback, delayMs)
    },
  })
}
