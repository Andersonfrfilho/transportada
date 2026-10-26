/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { classifyDeliveryFailure } from '@/modules/conversation/shared/conversationOutboxFailure.service'
import { DriverConversationRequestError } from '@/modules/conversation/shared/driverConversationsHttp.service'

import type { ClientBoletoEmailOutcome } from '../shared/clientBoletoEmail.types'
import { getClientBoletoEmailRuntime } from '../shared/clientBoletoEmailInstance.service'
import { clientBoletoEmailsQueryKey } from './useClientBoletoEmails.hook'

export type ClientBoletoEmailSendErrorKey = 'failed' | 'invalid' | 'unavailable'

export type ClientBoletoEmailSendStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'sending' }>
  | Readonly<{ kind: 'sent'; outcome: ClientBoletoEmailOutcome }>
  | Readonly<{ kind: 'queued' }>
  | Readonly<{ errorKey: ClientBoletoEmailSendErrorKey; kind: 'error' }>

export type ClientBoletoEmailSendChoice = Readonly<{
  emailIds: readonly string[]
  newAddress?: string | undefined
  save: boolean
}>

/** A recusa da API vira uma frase; o código exato não importa ao motorista. */
export function resolveSendErrorKey(error: unknown): ClientBoletoEmailSendErrorKey {
  if (!(error instanceof DriverConversationRequestError)) return 'failed'
  if (error.status === 409 || error.status === 403 || error.status === 404) return 'unavailable'
  if (error.status === 400 || error.status === 422) return 'invalid'
  return 'failed'
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * O envio do motorista (RF6/RF11): tenta já, e quando não há sinal (ou a rede cai no meio) o pedido vai para a fila
 * com a MESMA `idempotencyKey` — a drenagem repete a chave, então o boleto não sai duas vezes.
 */
export function useClientBoletoEmailSend(input: {
  readonly isOnline: boolean
  readonly occurrenceId: string
}): Readonly<{
  reset: () => void
  send: (choice: ClientBoletoEmailSendChoice) => Promise<void>
  status: ClientBoletoEmailSendStatus
}> {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ClientBoletoEmailSendStatus>({ kind: 'idle' })

  async function send(choice: ClientBoletoEmailSendChoice): Promise<void> {
    const { api, outbox } = getClientBoletoEmailRuntime()
    const request = {
      emailIds: choice.emailIds,
      idempotencyKey: newIdempotencyKey(),
      ...(choice.newAddress === undefined ? {} : { newAddress: choice.newAddress }),
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
      await queryClient.invalidateQueries({
        queryKey: clientBoletoEmailsQueryKey(input.occurrenceId),
      })
    } catch (error) {
      if (classifyDeliveryFailure(error) === 'retry') {
        await outbox.enqueue(request)
        setStatus({ kind: 'queued' })
        return
      }
      setStatus({ errorKey: resolveSendErrorKey(error), kind: 'error' })
    }
  }

  return { reset: () => setStatus({ kind: 'idle' }), send, status }
}
