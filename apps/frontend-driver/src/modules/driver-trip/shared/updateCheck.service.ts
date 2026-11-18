/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Intervalo mínimo entre duas procuras de versão nova: voltar ao app várias vezes não vira uma rajada de requisições. */
export const UPDATE_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000

/**
 * Procura de versão nova do PWA (18/11): o navegador só procura o service worker ao navegar, e o app instalado
 * fica dias aberto. A procura corre ao voltar para o app e de hora em hora, nunca com a tela escondida e nunca
 * antes de passar o intervalo mínimo. `isMidSession` diz que a versão achada chegou depois da abertura —
 * quem recebe mostra o aviso e **não** recarrega a página debaixo de quem está usando.
 */
export function createUpdateCheckScheduler(input: {
  readonly check: () => void
  readonly isVisible: () => boolean
  readonly markMidSession: () => void
  readonly minIntervalMs?: number
  readonly now: () => number
}): Readonly<{ run: () => boolean }> {
  const minIntervalMs = input.minIntervalMs ?? UPDATE_CHECK_MIN_INTERVAL_MS
  let lastCheckAt: number | undefined

  function run(): boolean {
    if (!input.isVisible()) return false
    const now = input.now()
    if (lastCheckAt !== undefined && now - lastCheckAt < minIntervalMs) return false
    lastCheckAt = now
    input.markMidSession()
    input.check()
    return true
  }

  return { run }
}
