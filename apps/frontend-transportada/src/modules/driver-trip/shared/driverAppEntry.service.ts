/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isStandaloneDisplay,
  resolveDriverAppRedirect,
  type DriverAppRedirectMode,
} from './driverAppRedirect.service'
import { createIndexedDbAttachmentStore, createIndexedDbQueueStore } from './indexedDbQueue.service'
import type { AttachmentStore } from './offlineAttachments.service'
import type { OfflineQueueStore } from './offlineQueue.service'
import { countPending } from './pendingQueue.service'

/**
 * Revisão LOW: um IndexedDB preso (armazenamento bloqueado por outra aba, disco cheio sem erro
 * imediato) não rejeita — ele nunca resolve, e sem teto o boot travaria aqui para sempre, antes de
 * qualquer tela aparecer. Sentinela local: não é `undefined` nem um erro, para não se confundir com
 * o que as duas lojas já podem devolver.
 */
const DRIVER_APP_ENTRY_INDEXED_DB_TIMEOUT_MS = 3_000
const INDEXED_DB_TIMED_OUT = Symbol('driver-app-entry-indexed-db-timeout')

/**
 * A metade impura da decisão da ADR-0075 §6: lê a fila antiga do IndexedDB desta origem e o modo
 * de exibição, e entrega à função pura. Só é chamada com o interruptor ligado — sem a variável, o
 * boot nem abre o IndexedDB.
 *
 * Fila ilegível (armazenamento bloqueado, quota) ou presa além do teto vira `stay`: o painel serve
 * `/minha-viagem` como sempre. Mandar embora sem saber se ficou entrega para trás seria o único
 * jeito de perdê-la.
 */
export async function readDriverAppMode(
  input: Readonly<{
    /** Só para teste: as lojas reais nunca mudam em produção. */
    createAttachmentStore?: () => AttachmentStore
    createQueueStore?: () => OfflineQueueStore
    driverAppUrl: string
    isFieldOnlyUser: boolean
    /** Só para teste: o teto real é sempre `DRIVER_APP_ENTRY_INDEXED_DB_TIMEOUT_MS`. */
    timeoutMs?: number
  }>,
): Promise<DriverAppRedirectMode> {
  const createQueueStore = input.createQueueStore ?? createIndexedDbQueueStore
  const createAttachmentStore = input.createAttachmentStore ?? createIndexedDbAttachmentStore
  const timeoutMs = input.timeoutMs ?? DRIVER_APP_ENTRY_INDEXED_DB_TIMEOUT_MS

  let pendingTotal: number
  try {
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<typeof INDEXED_DB_TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(INDEXED_DB_TIMED_OUT), timeoutMs)
    })
    const result = await Promise.race([
      Promise.all([createQueueStore().read(), createAttachmentStore().readAll()]),
      timeout,
    ]).finally(() => clearTimeout(timer))

    if (result === INDEXED_DB_TIMED_OUT) return 'stay'

    const [reports, attachments] = result
    pendingTotal = countPending({ attachments, now: new Date(), reports }).total
  } catch {
    return 'stay'
  }

  return resolveDriverAppRedirect({
    driverAppUrl: input.driverAppUrl,
    isFieldOnlyUser: input.isFieldOnlyUser,
    isStandalone: isStandaloneDisplay(window),
    pathname: window.location.pathname,
    pendingTotal,
  })
}
