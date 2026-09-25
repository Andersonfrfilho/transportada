/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * As lojas do IndexedDB do `useDriverTrip` nascem uma vez por montagem (ver o comentário na
 * assinatura do hook) — o efeito de montagem não reexecuta mais a cada render, e a drenagem perdeu
 * o único gatilho de repetição que tinha por acidente. Estes são os gatilhos explícitos que vêm no
 * lugar: `online`, `visibilitychange` visível e `pageshow` sempre chamam `drain`; o temporizador de
 * 30 s cobre o sinal fraco — onde `online` nunca dispara — e só corre enquanto houver algo drenável,
 * desligando sozinho quando a fila esvazia.
 */
export const QUEUE_DRAIN_INTERVAL_MS = 30_000

type DrainEventType = 'online' | 'pageshow' | 'visibilitychange'

export type DrainTriggerTarget = Readonly<{
  addEventListener: (type: DrainEventType, listener: () => void) => void
  clearInterval: (id: number) => void
  isVisible: () => boolean
  removeEventListener: (type: DrainEventType, listener: () => void) => void
  setInterval: (handler: () => void, timeout: number) => number
}>

export function scheduleQueueDrainTriggers(input: {
  readonly drain: () => void
  readonly getDrainable: () => number
  /**
   * Entrega a quem chama o `sync` do temporizador. Um item que chega enfileirado com sinal fraco
   * não dispara `online` nem muda a visibilidade — sem este aviso, o temporizador só nasceria no
   * próximo gatilho do navegador.
   */
  readonly onQueueSync?: (sync: () => void) => void
  readonly target: DrainTriggerTarget
}): () => void {
  let intervalId: number | undefined

  function stopInterval(): void {
    if (intervalId === undefined) return
    input.target.clearInterval(intervalId)
    intervalId = undefined
  }

  function tick(): void {
    input.drain()
    if (input.getDrainable() <= 0) stopInterval()
  }

  function syncInterval(): void {
    if (input.getDrainable() <= 0) {
      stopInterval()
      return
    }
    intervalId ??= input.target.setInterval(tick, QUEUE_DRAIN_INTERVAL_MS)
  }

  function handleOnline(): void {
    input.drain()
    syncInterval()
  }

  function handlePageshow(): void {
    input.drain()
    syncInterval()
  }

  function handleVisibilityChange(): void {
    if (!input.target.isVisible()) return
    input.drain()
    syncInterval()
  }

  input.target.addEventListener('online', handleOnline)
  input.target.addEventListener('pageshow', handlePageshow)
  input.target.addEventListener('visibilitychange', handleVisibilityChange)
  input.onQueueSync?.(syncInterval)
  syncInterval()

  return () => {
    input.target.removeEventListener('online', handleOnline)
    input.target.removeEventListener('pageshow', handlePageshow)
    input.target.removeEventListener('visibilitychange', handleVisibilityChange)
    stopInterval()
  }
}
