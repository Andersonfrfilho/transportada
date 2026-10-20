/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

export const EMAIL_RECIPIENT_NOT_ALLOWED_ERROR_CODE = 'email_recipient_not_allowed'

type SendRequest = Parameters<EmailDriverPort['send']>[0]

/** Entrada `@exemplo.com.br` libera o domínio inteiro; qualquer outra é um endereço exato. */
export function isRecipientAllowed(input: {
  readonly address: string
  readonly allowedRecipients: readonly string[]
}): boolean {
  const address = input.address.trim().toLowerCase()
  return input.allowedRecipients.some((entry) =>
    entry.startsWith('@') ? address.endsWith(entry) : address === entry,
  )
}

/**
 * Recusa permanente, sem tentar outro transporte: quem fica de fora da lista não deve receber nada,
 * e repetir a entrega não muda isso. O endereço não vai para a recusa (dado pessoal).
 */
export function withRecipientAllowlist(input: {
  readonly allowedRecipients: readonly string[]
  readonly driver: EmailDriverPort
}): EmailDriverPort {
  return {
    ...input.driver,
    send: (request: SendRequest) => {
      const isAllowed = isRecipientAllowed({
        address: String(request.to),
        allowedRecipients: input.allowedRecipients,
      })
      if (!isAllowed) {
        return Promise.resolve({
          errorCode: EMAIL_RECIPIENT_NOT_ALLOWED_ERROR_CODE,
          outcome: 'permanent' as const,
        })
      }
      return input.driver.send(request)
    },
  }
}
