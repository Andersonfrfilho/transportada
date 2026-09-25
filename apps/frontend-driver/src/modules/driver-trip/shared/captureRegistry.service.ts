/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Registro das capturas abertas (plan D2): câmera, recorte, assinatura e diálogo de ocorrência.
 * Tudo que navega a página — o `keycloak.init` da volta da rede (D4) e a atualização do SW (D2) —
 * espera `isIdle()`, porque navegar no meio de uma captura joga fora o que o motorista fez.
 *
 * A T3.3a trouxe o mínimo que o boot sem rede precisa (`open`, `close`, `isIdle`, `onIdle`); a
 * T3.5 liga as capturas a ele e traz o contrato próprio.
 */
export const CAPTURE_KINDS = ['camera', 'crop', 'signature', 'occurrence-dialog'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

export type CaptureRegistry = Readonly<{
  close: (kind: CaptureKind) => void
  isIdle: () => boolean
  /** Chamado a cada vez que a última captura aberta fecha. Devolve o cancelamento. */
  onIdle: (listener: () => void) => () => void
  open: (kind: CaptureKind) => void
}>

export function createCaptureRegistry(): CaptureRegistry {
  const openCountByKind = new Map<CaptureKind, number>()
  const idleListeners = new Set<() => void>()

  function isIdle(): boolean {
    return openCountByKind.size === 0
  }

  return {
    close(kind) {
      const count = openCountByKind.get(kind) ?? 0
      if (count === 0) return
      if (count > 1) openCountByKind.set(kind, count - 1)
      else openCountByKind.delete(kind)
      if (!isIdle()) return
      for (const listener of [...idleListeners]) listener()
    },
    isIdle,
    onIdle(listener) {
      idleListeners.add(listener)
      return () => {
        idleListeners.delete(listener)
      }
    },
    open(kind) {
      openCountByKind.set(kind, (openCountByKind.get(kind) ?? 0) + 1)
    },
  }
}

/** O registro da página: um só, porque é a página inteira que navega. */
export const captureRegistry = createCaptureRegistry()
