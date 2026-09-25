/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createIdleGate, type CaptureRegistry, type IdleGate } from './captureRegistry.service'

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

/** Um portão por registro: os toques repetidos esperam juntos o mesmo `close`. */
const IDLE_GATES = new WeakMap<object, IdleGate>()

/**
 * O toque em "Atualizar": aplica se ocioso (`'now'`), senão espera o `close` (`'deferred'`) — e a
 * tela diz "Atualiza ao terminar a captura". Spec 189 T9.2 (B4): cada toque com captura aberta
 * assinava um `onIdle` novo e o `close` aplicava uma vez por toque; o portão guarda um só.
 */
export function requestServiceWorkerUpdate(
  gate: Pick<ServiceWorkerUpdateGate, 'apply' | 'captureRegistry'>,
): 'deferred' | 'now' {
  let idleGate = IDLE_GATES.get(gate.captureRegistry)
  if (idleGate === undefined) {
    idleGate = createIdleGate(gate.captureRegistry)
    IDLE_GATES.set(gate.captureRegistry, idleGate)
  }
  return idleGate.request(gate.apply)
}
