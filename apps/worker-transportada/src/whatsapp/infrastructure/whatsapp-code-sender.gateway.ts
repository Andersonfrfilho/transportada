/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { WhatsAppMessageProvider } from '@adatechnology/meta-whatsapp-provider'

import type { DrizzleWhatsAppChannelRepository } from './drizzle-whatsapp-channel.repository.js'

export class WhatsAppChannelNotConfiguredError extends Error {
  constructor(companyId: string) {
    super(`No active WhatsApp channel for company ${companyId}`)
    this.name = 'WhatsAppChannelNotConfiguredError'
  }
}

export type WhatsAppCodeSender = {
  readonly send: (input: {
    readonly address: string
    readonly body: string
    readonly code: string
    readonly companyId: string
  }) => Promise<void>
}

/**
 * O template aprovado na Meta, com o código como único parâmetro do corpo.
 *
 * ⚠️ **Sem ele o envio só funciona dentro da janela de 24 h** — a Meta recusa mensagem livre para
 * quem não escreveu para o número nas últimas 24 horas, e quem recebe um convite nunca escreveu.
 * Então o texto livre é o caminho **degradado**, não o padrão: ele existe para o cliente que já está
 * conversando (recuperação de senha em atendimento em andamento) e para o mock local.
 */
export type WhatsAppCodeTemplate = {
  readonly languageCode: string
  readonly name: string
}

/**
 * Spec 062 T005 — o envio de código por WhatsApp, no trilho do convite e da recuperação de senha.
 *
 * ⚠️ **Este não é o driver da T004, e não deveria ser.** Lá quem envia é o módulo de notificação, com
 * template, preferência do destinatário e trilho de retry próprio; aqui é uma mensagem transacional
 * do trilho de identidade, que já tem o seu — e que **não passa pelo módulo de notificação em canal
 * nenhum**, nem no e-mail. Fazer o convite atravessar o módulo para reusar o driver trocaria um
 * caminho conhecido por dois, e é exatamente o que a T004 recusou fazer na direção contrária.
 *
 * O código é lido do envelope logo antes do envio e **nunca** aparece em log (`security.md` §1) — o
 * corpo da mensagem carrega o segredo, e por isso o erro daqui nomeia a empresa, jamais o conteúdo.
 */
export function createWhatsAppCodeSender(input: {
  readonly apiVersion: string
  readonly baseUrl: string | undefined
  readonly channels: Pick<DrizzleWhatsAppChannelRepository, 'findActiveCredential'>
  readonly template: WhatsAppCodeTemplate | undefined
  readonly secrets: {
    readonly decrypt: (request: {
      readonly channelId: string
      readonly companyId: string
      readonly envelope: unknown
    }) => Promise<string>
  }
}): WhatsAppCodeSender {
  return {
    async send(request) {
      const credential = await input.channels.findActiveCredential({ companyId: request.companyId })
      if (credential === undefined) throw new WhatsAppChannelNotConfiguredError(request.companyId)

      const accessToken = await input.secrets.decrypt({
        channelId: credential.channelId,
        companyId: request.companyId,
        envelope: credential.envelope,
      })
      const provider = new WhatsAppMessageProvider({
        accessToken,
        apiVersion: input.apiVersion,
        phoneNumberId: credential.phoneNumberId,
        ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
      })

      const to = toMetaRecipient(request.address)
      if (input.template === undefined) {
        await provider.sendText(to, request.body)

        return
      }

      await provider.sendTemplate({
        bodyParameters: [request.code],
        languageCode: input.template.languageCode,
        templateName: input.template.name,
        to,
      })
    },
  }
}

/**
 * A Meta quer E.164 **sem o `+`** e sem pontuação, e o contato do cadastro é digitado por gente.
 * Mandá-lo cru faz a Graph API recusar com um erro que parece de credencial.
 */
function toMetaRecipient(phone: string): string {
  return phone.replaceAll(/[^0-9]/gu, '')
}
