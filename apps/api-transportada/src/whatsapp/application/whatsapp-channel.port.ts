/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { WhatsAppChannelStatus } from '../../database/whatsapp-channel.schema.js'

/**
 * O que a tela vê. ⚠️ **Não existe campo de token aqui, e é de propósito:** o resumo é a única forma
 * que sai do repositório para a rota, e um campo a mais nele vazaria por espalhamento no dia em que
 * alguém serializasse o objeto inteiro. Quem precisa saber se há token pergunta `tokenConfigured`.
 */
export type WhatsAppChannelSummary = {
  readonly createdAt: string
  readonly displayPhoneNumber: string
  readonly id: string
  readonly phoneNumberId: string
  readonly status: WhatsAppChannelStatus
  readonly tokenConfigured: boolean
  readonly updatedAt: string
  readonly version: string
  readonly wabaId: string
}

export type SaveWhatsAppChannelValues = {
  /** Ausente na atualização: quem não manda token novo mantém o que está selado. */
  readonly accessToken?: string | undefined
  readonly displayPhoneNumber: string
  readonly phoneNumberId: string
  readonly status: WhatsAppChannelStatus
  readonly wabaId: string
}

/** O que o repositório grava — o envelope já selado, nunca o token. */
export type WhatsAppChannelRecord = {
  readonly companyId: string
  readonly displayPhoneNumber: string
  readonly phoneNumberId: string
  readonly secretEnvelope: SecretEnvelopeV1 | undefined
  readonly status: WhatsAppChannelStatus
  readonly wabaId: string
}

export type WhatsAppChannelRepositoryPort = {
  /** `null` quando a empresa não tem canal — ausência, não erro: nem toda instalação usa WhatsApp. */
  find(input: { readonly companyId: string }): Promise<WhatsAppChannelSummary | null>
  /** O envelope selado, para quem vai **enviar**. Só o driver chama isto. */
  findSecret(input: {
    readonly companyId: string
  }): Promise<{ readonly channelId: string; readonly envelope: SecretEnvelopeV1 } | null>
  remove(input: { readonly companyId: string }): Promise<boolean>
  save(input: WhatsAppChannelRecord): Promise<WhatsAppChannelSummary>
}
