import type { NfseInvoiceDelivery } from './nfseInvoice.types'

/**
 * A prefeitura fala por código e mensagem; o gateway fala por causa classificada. As duas coisas
 * não se traduzem uma na outra: a mensagem sai literal, a causa sai pelo dicionário.
 */
export type NfseDeliveryFailure =
  | Readonly<{ cause: string; kind: 'cause' }>
  | Readonly<{ kind: 'message'; text: string }>

/** Nota autorizada entregou: falha anterior ali é história, e história assusta sem motivo. */
export function describeNfseDeliveryFailure(
  delivery: NfseInvoiceDelivery,
): NfseDeliveryFailure | null {
  if (delivery.status === 'authorized') return null
  if (delivery.lastErrorMessage !== null) {
    const code = delivery.lastErrorCode === null ? '' : `${delivery.lastErrorCode} — `
    return { kind: 'message', text: `${code}${delivery.lastErrorMessage}` }
  }
  if (delivery.lastErrorCause !== null) return { cause: delivery.lastErrorCause, kind: 'cause' }
  return null
}

/**
 * A próxima tentativa só existe enquanto a entrega ainda anda: numa nota liquidada a data que
 * sobrou seria promessa de uma tentativa que não vem.
 */
export function hasPendingNfseDelivery(delivery: NfseInvoiceDelivery): boolean {
  return delivery.nextAttemptAt !== null && delivery.status !== 'authorized'
}
