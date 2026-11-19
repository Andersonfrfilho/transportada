/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Aviso de "nova versão": a aba aberta antes de um deploy segue rodando o código antigo (inclusive os
 * trechos já carregados) até alguém recarregar. O service worker novo só é buscado quando a página
 * abre, então a aba esquecida nunca descobre. Aqui a aba pergunta de tempos em tempos e, achando uma
 * versão nova, **avisa** — nunca recarrega sozinha, porque recarregar no meio de um formulário perde
 * o que a pessoa digitou.
 */
export const APP_UPDATE_CHECK_INTERVAL_MILLISECONDS = 300_000

type Listener = () => void

export type AppUpdateStore = Readonly<{
  /** Chamada pelo service worker quando há versão nova esperando. */
  markReady(applyUpdate: () => Promise<void>): void
  /** O clique em "Recarregar": ativa a versão nova e recarrega a aba. */
  apply(): Promise<void>
  isReady(): boolean
  subscribe(listener: Listener): () => void
}>

export function createAppUpdateStore(): AppUpdateStore {
  const listeners = new Set<Listener>()
  let ready = false
  let applyUpdate: (() => Promise<void>) | null = null
  return {
    markReady(apply) {
      applyUpdate = apply
      if (ready) return
      ready = true
      for (const listener of listeners) listener()
    },
    async apply() {
      await applyUpdate?.()
    },
    isReady: () => ready,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const appUpdateStore = createAppUpdateStore()

type UpdateCheckTarget = Readonly<{
  update(): Promise<unknown>
}>

type UpdateCheckEnvironment = Readonly<{
  addVisibilityListener(listener: () => void): void
  isVisible(): boolean
  isOnline(): boolean
  setInterval(handler: () => void, milliseconds: number): void
}>

/**
 * Pergunta ao navegador se há service worker novo: a cada intervalo e quando a aba volta a ficar
 * visível, só com rede (sem rede a pergunta falharia à toa). Falha da pergunta nunca sobe.
 */
export function scheduleUpdateChecks(
  registration: UpdateCheckTarget,
  environment: UpdateCheckEnvironment,
): void {
  const check = (): void => {
    if (!environment.isOnline()) return
    registration.update().catch(() => undefined)
  }
  environment.setInterval(check, APP_UPDATE_CHECK_INTERVAL_MILLISECONDS)
  environment.addVisibilityListener(() => {
    if (environment.isVisible()) check()
  })
}
