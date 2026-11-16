/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import { renderEvolutionChoice } from '../domain/whatsapp-evolution-choice.policy.js'
import type {
  WhatsAppChoiceOption,
  WhatsAppMessageSenderPort,
} from '../application/whatsapp-command-driver.port.js'

/** Quanto tempo as linhas oferecidas valem: a conversa de contas não é uma sessão de horas. */
const OFFER_TTL_MS = 30 * 60_000

export type EvolutionAssistantTransport = {
  readonly channel: ChannelAdapterInterface
  /** Descarta as linhas oferecidas (resposta consumida, conversa encerrada). */
  readonly forget: (input: { readonly companyId: string; readonly phone: string }) => void
  /** As linhas da última escolha oferecida a este telefone; vazio quando não há. */
  readonly offered: (input: {
    readonly companyId: string
    readonly phone: string
  }) => readonly WhatsAppChoiceOption[]
  readonly sender: WhatsAppMessageSenderPort
}

/**
 * Spec 308 + assistente de contas: o canal do assistente (escrito para a Meta) falando pelo número Evolution da
 * empresa. Texto sai como texto; lista e botões saem numerados e as linhas ficam lembradas para o número digitado
 * voltar a ser o id da opção. As linhas valem até a próxima resposta da pessoa.
 */
export function createEvolutionAssistantTransport(input: {
  readonly clock: () => Date
  readonly companyId: string
  readonly send: (message: {
    readonly companyId: string
    readonly phone: string
    readonly text: string
  }) => Promise<void> | void
}): EvolutionAssistantTransport {
  const { companyId } = input
  const offers = new Map<
    string,
    { readonly expiresAt: number; readonly rows: WhatsAppChoiceOption[] }
  >()

  const deliver = async (phone: string, text: string) => {
    await input.send({ companyId, phone, text })
  }
  const offer = async (phone: string, body: string, rows: readonly WhatsAppChoiceOption[]) => {
    offers.set(phone, { expiresAt: input.clock().getTime() + OFFER_TTL_MS, rows: [...rows] })
    await deliver(phone, renderEvolutionChoice({ body, options: rows }))
  }
  // O texto NÃO apaga as linhas: o interpretador diz "Responda à pergunta acima." logo depois da lista, no mesmo turno.
  // As linhas morrem quando a resposta chega (`forget`) ou vencem em 30 minutos.
  const sendText = async (phone: string, body: string) => {
    await deliver(phone, body)
  }
  const unsupported = (what: string) => () =>
    Promise.reject(new Error(`The Evolution assistant channel does not support ${what}`))

  const sender: WhatsAppMessageSenderPort = {
    sendButtons: ({ body, buttons, to }) => offer(to, body, buttons),
    sendList: ({ body, rows, to }) => offer(to, body, rows),
    sendText: ({ body, to }) => sendText(to, body),
  }
  const channel: ChannelAdapterInterface = {
    fetchMediaAsBase64: unsupported('media download'),
    sendInteractiveButtons: async ({ body, buttons, to }) => {
      await offer(to, body, buttons)
      return { externalMessageId: null }
    },
    sendInteractiveList: async ({ body, rows, to }) => {
      await offer(to, body, rows)
      return { externalMessageId: null }
    },
    sendMedia: unsupported('media'),
    sendTemplate: unsupported('templates'),
    sendText: async (to, body) => {
      await sendText(to, body)
      return { externalMessageId: null }
    },
  }

  return {
    channel,
    forget: ({ phone }) => {
      offers.delete(phone)
    },
    offered: ({ phone }) => {
      const current = offers.get(phone)
      if (current === undefined) return []
      if (current.expiresAt < input.clock().getTime()) {
        offers.delete(phone)
        return []
      }
      return current.rows
    },
    sender,
  }
}
