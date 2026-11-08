/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: a resposta a quem mandou os XMLs. E-mail sai pelo Resend da própria transportadora (mesma configuração e
 * credencial do e-mail de contratantes); WhatsApp sai pelo Evolution da empresa, no grupo de onde o arquivo veio ou no
 * privado de quem mandou. Canal indisponível lança: o ciclo conta a tentativa e tenta de novo, até o teto.
 */
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import type { ResendMailGateway } from '../../contractor-mail/infrastructure/resend-mail.gateway.js'
import type { ReceiptReplyPort } from '../application/nfe-xml-receipt.types.js'

const SUBJECT = 'Importação de notas fiscais (XML)'

export type ReceiptReplySettings = {
  readonly id: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

export function createReceiptReplyAdapter(dependencies: {
  readonly findSettings: (input: {
    readonly companyId: string
  }) => Promise<ReceiptReplySettings | undefined>
  readonly mailGateway: Pick<ResendMailGateway, 'sendEmail'>
  /** Sem Resend (sandbox/dev) o e-mail não sai: o ciclo registra e segue, em vez de tentar para sempre. */
  readonly resendDisabled?: boolean
  readonly secretService: Pick<ContractorMailCredentialSecretService, 'decrypt'>
  readonly sendWhatsAppText: (input: {
    readonly body: string
    readonly companyId: string
    readonly number: string
  }) => Promise<unknown>
}): ReceiptReplyPort {
  return {
    async send(input) {
      if (input.channel === 'whatsapp') {
        await dependencies.sendWhatsAppText({
          body: input.text,
          companyId: input.companyId,
          number: input.replyTo ?? input.sender,
        })
        return
      }
      if (dependencies.resendDisabled === true) return
      const settings = await dependencies.findSettings({ companyId: input.companyId })
      if (settings === undefined) throw new Error('contractor mail settings not found')
      const secret = await dependencies.secretService.decrypt({
        companyId: input.companyId,
        envelope: settings.secretEnvelope,
        settingsId: settings.id,
      })
      await dependencies.mailGateway.sendEmail({
        apiKey: secret.apiKey,
        from: `${settings.senderName} <${settings.senderAddress}>`,
        headers: {},
        idempotencyKey: `nfe-xml-reply-${crypto.randomUUID()}`,
        subject: SUBJECT,
        text: input.text,
        to: [input.sender],
      })
    },
  }
}
