/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { classifyDeliveryFailure } from '@/modules/conversation/shared/conversationOutboxFailure.service'
import { DriverConversationRequestError } from '@/modules/conversation/shared/driverConversationsHttp.service'

import type { ClientBoletoWhatsAppOutcome } from '../shared/clientBoletoWhatsApp.types'
import { getClientBoletoWhatsAppRuntime } from '../shared/clientBoletoWhatsAppInstance.service'
import { clientBoletoWhatsAppQueryKey } from './useClientBoletoWhatsApp.hook'

export type ClientBoletoWhatsAppSendErrorKey =
  | 'dailyCap'
  | 'failed'
  | 'invalid'
  | 'limit'
  | 'unavailable'

export type ClientBoletoWhatsAppSendStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'sending' }>
  | Readonly<{ kind: 'sent'; outcome: ClientBoletoWhatsAppOutcome }>
  | Readonly<{ kind: 'queued' }>
  | Readonly<{ errorKey: ClientBoletoWhatsAppSendErrorKey; kind: 'error' }>

export type ClientBoletoWhatsAppSendChoice = Readonly<{
  contactIds: readonly string[]
  /** O número como foi digitado e confirmado; a API normaliza de novo. */
  number?: string | undefined
  save: boolean
}>

/** A recusa da API vira uma frase; o código exato não importa ao motorista. */
export function resolveSendErrorKey(error: unknown): ClientBoletoWhatsAppSendErrorKey {
  if (!(error instanceof DriverConversationRequestError)) return 'failed'
  if (error.status === 429) return 'dailyCap'
  if (error.status === 422) return 'limit'
  if (error.status === 409 || error.status === 403 || error.status === 404) return 'unavailable'
  if (error.status === 400) return 'invalid'
  return 'failed'
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * O envio do motorista (RF3/RF10): tenta já, e quando não há sinal (ou a rede cai no meio) o pedido vai para a fila
 * com a MESMA `idempotencyKey` — a drenagem repete a chave, então o boleto não sai duas vezes. O reenvio de uma
 * entrega que falhou (`resend`) leva chave nova por toque e só vale com sinal: é uma decisão do motorista, não da fila.
 */
export function useClientBoletoWhatsAppSend(input: {
  readonly isOnline: boolean
  readonly occurrenceId: string
}): Readonly<{
  reset: () => void
  resend: (deliveryId: string) => Promise<void>
  send: (choice: ClientBoletoWhatsAppSendChoice) => Promise<void>
  status: ClientBoletoWhatsAppSendStatus
}> {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ClientBoletoWhatsAppSendStatus>({ kind: 'idle' })

  async function refreshOptions(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: clientBoletoWhatsAppQueryKey(input.occurrenceId),
    })
  }

  async function send(choice: ClientBoletoWhatsAppSendChoice): Promise<void> {
    const { api, outbox } = getClientBoletoWhatsAppRuntime()
    const request = {
      contactIds: choice.contactIds,
      idempotencyKey: newIdempotencyKey(),
      ...(choice.number === undefined ? {} : { number: choice.number }),
      occurrenceId: input.occurrenceId,
      save: choice.save,
    }
    setStatus({ kind: 'sending' })
    if (!input.isOnline) {
      await outbox.enqueue(request)
      setStatus({ kind: 'queued' })
      return
    }
    try {
      const outcome = await api.send(request)
      setStatus({ kind: 'sent', outcome })
      await refreshOptions()
    } catch (error) {
      if (classifyDeliveryFailure(error) === 'retry') {
        await outbox.enqueue(request)
        setStatus({ kind: 'queued' })
        return
      }
      setStatus({ errorKey: resolveSendErrorKey(error), kind: 'error' })
    }
  }

  async function resend(deliveryId: string): Promise<void> {
    if (!input.isOnline) {
      setStatus({ errorKey: 'failed', kind: 'error' })
      return
    }
    setStatus({ kind: 'sending' })
    try {
      const outcome = await getClientBoletoWhatsAppRuntime().api.resend({
        deliveryId,
        idempotencyKey: newIdempotencyKey(),
        occurrenceId: input.occurrenceId,
      })
      setStatus({ kind: 'sent', outcome })
      await refreshOptions()
    } catch (error) {
      setStatus({ errorKey: resolveSendErrorKey(error), kind: 'error' })
    }
  }

  return { reset: () => setStatus({ kind: 'idle' }), resend, send, status }
}
