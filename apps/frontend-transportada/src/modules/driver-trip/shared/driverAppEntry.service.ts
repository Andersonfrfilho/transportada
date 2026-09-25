/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isStandaloneDisplay,
  resolveDriverAppRedirect,
  type DriverAppRedirectMode,
} from './driverAppRedirect.service'
import { createIndexedDbAttachmentStore, createIndexedDbQueueStore } from './indexedDbQueue.service'
import { countPending } from './pendingQueue.service'

/**
 * A metade impura da decisão da ADR-0075 §6: lê a fila antiga do IndexedDB desta origem e o modo
 * de exibição, e entrega à função pura. Só é chamada com o interruptor ligado — sem a variável, o
 * boot nem abre o IndexedDB.
 *
 * Fila ilegível (armazenamento bloqueado, quota) vira `stay`: o painel serve `/minha-viagem` como
 * sempre. Mandar embora sem saber se ficou entrega para trás seria o único jeito de perdê-la.
 */
export async function readDriverAppMode(
  input: Readonly<{ driverAppUrl: string; isFieldOnlyUser: boolean }>,
): Promise<DriverAppRedirectMode> {
  let pendingTotal: number
  try {
    const [reports, attachments] = await Promise.all([
      createIndexedDbQueueStore().read(),
      createIndexedDbAttachmentStore().readAll(),
    ])
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
