/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CaptureRegistry } from './captureRegistry.service'

/**
 * Atualização em ponto seguro (plan D2). Antes da primeira captura desta sessão, aplicar sozinho é
 * seguro — não há nada em andamento para perder. Depois dela, o `onNeedRefresh` do `registerSW`
 * mostra "Nova versão — Atualizar" em vez de aplicar, e o toque só aplica se o registro estiver
 * ocioso; com captura aberta, espera o `close` (o mesmo problema que `scheduleAuthenticationOnReconnect`,
 * de `bootMode.service.ts`, resolve para a reconexão).
 */
export type ServiceWorkerUpdateGate = Readonly<{
  apply: () => void
  captureRegistry: Pick<CaptureRegistry, 'hasOpened' | 'isIdle' | 'onIdle'>
  showUpdateBanner: () => void
}>

/** Chamado pelo `onNeedRefresh`: decide entre aplicar sozinho e avisar. */
export function handleServiceWorkerUpdateAvailable(gate: ServiceWorkerUpdateGate): void {
  if (!gate.captureRegistry.hasOpened()) {
    gate.apply()
    return
  }
  gate.showUpdateBanner()
}

/** O toque em "Atualizar": aplica se ocioso, senão espera o `close`. */
export function requestServiceWorkerUpdate(
  gate: Pick<ServiceWorkerUpdateGate, 'apply' | 'captureRegistry'>,
): void {
  if (gate.captureRegistry.isIdle()) {
    gate.apply()
    return
  }
  const unsubscribe = gate.captureRegistry.onIdle(() => {
    unsubscribe()
    gate.apply()
  })
}
