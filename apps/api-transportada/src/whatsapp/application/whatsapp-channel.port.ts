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

/**
 * O que o **envio** precisa: o envelope e o número, com a empresa junto — o AAD amarra o selo ao par
 * `(companyId, channelId)`, e um credencial sem a empresa não abriria.
 */
export type WhatsAppChannelCredential = {
  readonly channelId: string
  readonly companyId: string
  readonly envelope: SecretEnvelopeV1
  readonly phoneNumberId: string
}

export type WhatsAppChannelRepositoryPort = {
  /**
   * Os canais ativos **da instalação inteira**, com teto de dois.
   *
   * ⚠️ Existe porque o `WhatsAppDriverPort` do `notification-module` recebe `{to, body, template}` e
   * **não recebe empresa** — o módulo estreita a `delivery` antes de chamar o driver, mesmo tendo o
   * `job.companyId` na mão. Sem a empresa, o driver não tem como escolher entre dois números; o teto
   * de dois é o suficiente para distinguir "nenhum", "um" e "mais de um" numa consulta só, e o
   * "mais de um" é recusa, nunca palpite. Ver o buraco declarado na evidência da T004.
   */
  findActiveCredentials(): Promise<readonly WhatsAppChannelCredential[]>
  /** `null` quando a empresa não tem canal — ausência, não erro: nem toda instalação usa WhatsApp. */
  find(input: { readonly companyId: string }): Promise<WhatsAppChannelSummary | null>
  /** O envelope selado de **uma** empresa, para quem já sabe de quem é. */
  findSecret(input: {
    readonly companyId: string
  }): Promise<{ readonly channelId: string; readonly envelope: SecretEnvelopeV1 } | null>
  remove(input: { readonly companyId: string }): Promise<boolean>
  save(input: WhatsAppChannelRecord): Promise<WhatsAppChannelSummary>
}
