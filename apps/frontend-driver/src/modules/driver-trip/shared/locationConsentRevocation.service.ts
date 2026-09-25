/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 189 T9.2 (LGPD art. 8º §5º, ADR-0075 §8): a retirada do consentimento vale **no toque**. O
 * cache do TanStack avisa os observadores por `setTimeout(0)` e a tela da viagem só para o GPS num
 * efeito do React — um temporizador de envio que vencesse nesse intervalo ainda subia uma posição
 * (CA14 na CI). Esta retirada local é síncrona e compartilhada: o interruptor do Perfil e o
 * controlador de envio leem a mesma, e só um `PUT` de **ligar** bem-sucedido a desfaz.
 */
export type LocationConsentRevocation = Readonly<{
  isRevoked: () => boolean
  restore: () => void
  /** Síncrono: quem escuta para antes de qualquer `await`, dentro do próprio toque. */
  revoke: () => void
  subscribe: (listener: () => void) => () => void
}>

export function createLocationConsentRevocation(): LocationConsentRevocation {
  let isRevoked = false
  const listeners = new Set<() => void>()

  function change(next: boolean): void {
    if (next === isRevoked) return
    isRevoked = next
    for (const listener of [...listeners]) listener()
  }

  return {
    isRevoked: () => isRevoked,
    restore: () => change(false),
    revoke: () => change(true),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const locationConsentRevocation = createLocationConsentRevocation()
