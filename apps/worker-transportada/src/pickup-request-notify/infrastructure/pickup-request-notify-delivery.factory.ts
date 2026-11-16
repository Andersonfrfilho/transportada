/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339 T4: a entrega dos avisos. E-mail sai pelo Resend da própria transportadora (a mesma configuração e credencial do
 * e-mail de contratantes) no modelo padrão de e-mail da empresa; WhatsApp sai pelo Evolution da empresa. Nenhum layout em
 * código.
 */
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import { createDrizzleCompanyLogoReader } from '../../contractor-mail/infrastructure/drizzle-company-logo.reader.js'
import type { ResendMailGateway } from '../../contractor-mail/infrastructure/resend-mail.gateway.js'
import { buildContractorReplyLayoutMail } from '../../occurrence-conversation/infrastructure/contractor-reply-client-email-layout.support.js'
import type { PickupRequestNotifyPorts } from '../application/pickup-request-notify.port.js'
import {
  findPickupOfficeEmails,
  type PickupRequestNotifyDatabase,
} from './drizzle-pickup-request-notify.repository.js'

export type PickupNotifyMailSettings = {
  readonly id: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

export function createPickupRequestNotifyDelivery(input: {
  readonly database: PickupRequestNotifyDatabase
  readonly findMailSettings: (input: {
    readonly companyId: string
  }) => Promise<PickupNotifyMailSettings | undefined>
  readonly mailGateway: Pick<ResendMailGateway, 'sendEmail'>
  /** Sem Resend (sandbox/dev) o e-mail não sai: o aviso é dado por entregue em vez de tentar para sempre. */
  readonly resendDisabled: boolean
  readonly secretService: Pick<ContractorMailCredentialSecretService, 'decrypt'>
  readonly sendWhatsAppText: (input: {
    readonly body: string
    readonly companyId: string
    readonly number: string
  }) => Promise<unknown>
}): PickupRequestNotifyPorts['delivery'] {
  const logoReader = createDrizzleCompanyLogoReader(input.database)
  return {
    email: async ({ body, companyId, idempotencyKey, subject, to }) => {
      if (input.resendDisabled) return
      const settings = await input.findMailSettings({ companyId })
      if (settings === undefined) throw new Error('contractor_mail_settings_not_found')
      const secret = await input.secretService.decrypt({
        companyId,
        envelope: settings.secretEnvelope,
        settingsId: settings.id,
      })
      const mail = await buildContractorReplyLayoutMail(input.database, {
        body,
        companyId,
        subject,
      })
      const logo = mail.hasInlineLogo ? await logoReader.find({ companyId }) : undefined
      await input.mailGateway.sendEmail({
        apiKey: secret.apiKey,
        ...(logo === undefined
          ? {}
          : {
              attachments: [
                {
                  content: logo.contentBase64,
                  contentId: 'company-logo',
                  contentType: logo.mimeType,
                  fileName: logo.mimeType === 'image/png' ? 'logo.png' : 'logo.jpg',
                },
              ],
            }),
        from: `${settings.senderName} <${settings.senderAddress}>`,
        headers: {},
        html: mail.html,
        idempotencyKey,
        subject: mail.subject,
        text: mail.text,
        to: [...to],
      })
    },
    officeEmails: (query) => findPickupOfficeEmails(input.database, query),
    whatsapp: async (message) => {
      await input.sendWhatsAppText(message)
    },
  }
}
