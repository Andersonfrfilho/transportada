/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Pedido do usuário (01/10): "mesmo se ele não ver tem que existir na nossa tela de pendências para
 * ir sincronizando quando o app está aberto". A drenagem é offline-first e só roda com a app aberta
 * (`pendingQueue.service.ts`: abertura, `online`, `pageshow`, voltar a ficar visível, e 30 s
 * enquanto houver fila) — sem Background Sync, que exigiria o token no service worker
 * (`security.md` §8, ADR-0056). Então a tela precisa dizer **de quando é** a última sincronização:
 * sem isso o motorista não tem como saber que algo ficou para trás.
 */

/** Abaixo de um minuto não se conta minuto: "agora mesmo" é mais honesto que "há 0 min". */
export const SYNC_AGE_NOW_THRESHOLD_MS = 60_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export type SyncAge =
  | Readonly<{ unit: 'now' }>
  | Readonly<{ unit: 'minutes'; value: number }>
  | Readonly<{ unit: 'hours'; value: number }>

/**
 * `undefined` é "nunca sincronizou nesta sessão" — a tela não inventa idade para dado que não veio.
 * Relógio do aparelho atrasado em relação ao servidor daria idade negativa: vale "agora mesmo",
 * nunca um número negativo na cara do motorista.
 */
export function resolveSyncAge(input: {
  readonly nowMs: number
  readonly syncedAtMs: number
}): SyncAge | undefined {
  if (!Number.isFinite(input.syncedAtMs) || input.syncedAtMs <= 0) return undefined

  const elapsed = input.nowMs - input.syncedAtMs
  if (elapsed < SYNC_AGE_NOW_THRESHOLD_MS) return { unit: 'now' }
  if (elapsed < HOUR_MS) return { unit: 'minutes', value: Math.floor(elapsed / MINUTE_MS) }
  return { unit: 'hours', value: Math.floor(elapsed / HOUR_MS) }
}
