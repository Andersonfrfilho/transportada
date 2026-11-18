/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Intervalo mínimo entre duas procuras de versão nova: voltar ao app várias vezes não vira uma rajada de requisições. */
export const UPDATE_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000

/**
 * Procura de versão nova do PWA (18/11): o navegador só procura o service worker ao navegar, e o app instalado
 * fica dias aberto. A procura corre ao voltar para o app e de hora em hora, nunca com a tela escondida, nunca
 * antes de passar o intervalo mínimo e nunca duas ao mesmo tempo. Só a procura que **terminou** gasta o intervalo:
 * uma que falhou (sem rede) pode ser repetida assim que o motorista voltar ao app.
 * `markMidSession` roda antes de cada procura: a versão que ela achar chegou com o app em uso, e quem recebe
 * mostra o aviso em vez de recarregar a página debaixo do motorista.
 */
export function createUpdateCheckScheduler(input: {
  readonly check: () => Promise<void>
  readonly isVisible: () => boolean
  readonly markMidSession: () => void
  readonly minIntervalMs?: number
  readonly now: () => number
}): Readonly<{ run: () => Promise<boolean> }> {
  const minIntervalMs = input.minIntervalMs ?? UPDATE_CHECK_MIN_INTERVAL_MS
  let lastCheckAt: number | undefined
  let isChecking = false

  async function run(): Promise<boolean> {
    if (isChecking || !input.isVisible()) return false
    const startedAt = input.now()
    if (lastCheckAt !== undefined && startedAt - lastCheckAt < minIntervalMs) return false
    isChecking = true
    input.markMidSession()
    try {
      await input.check()
      lastCheckAt = startedAt
      return true
    } catch {
      return false
    } finally {
      isChecking = false
    }
  }

  return { run }
}
