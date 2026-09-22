/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const MAIL_SEND_READINESS_REASONS = [
  'not_configured',
  'sending_not_verified',
  'template_missing',
] as const
export type MailSendReadinessReason = (typeof MAIL_SEND_READINESS_REASONS)[number]

export type MailSendReadinessSettings = {
  readonly sendingVerifiedAt: Date | null | undefined
}

export type MailSendReadinessTemplate = {
  readonly id: string
}

export type ResolveMailSendReadinessParams<TSettings extends MailSendReadinessSettings> = {
  readonly settings: TSettings | undefined
  /** Omitido: o envio ainda não exige modelo. `null`: foi procurado e não existe. */
  readonly template?: MailSendReadinessTemplate | null
}

export type MailSendReadinessResult<TSettings extends MailSendReadinessSettings> =
  | { readonly ready: true; readonly settings: TSettings }
  | { readonly ready: false; readonly reason: MailSendReadinessReason }

/**
 * Spec 150 RF16/RF17: o envio é liberado pela chave aceita e pelo domínio do remetente verificado
 * (`sendingVerifiedAt`), nunca pelo `status` da ida e volta da 143.
 */
export function resolveMailSendReadiness<TSettings extends MailSendReadinessSettings>(
  params: ResolveMailSendReadinessParams<TSettings>,
): MailSendReadinessResult<TSettings> {
  const { settings, template } = params
  if (settings === undefined) return { ready: false, reason: 'not_configured' }
  if (settings.sendingVerifiedAt === null || settings.sendingVerifiedAt === undefined) {
    return { ready: false, reason: 'sending_not_verified' }
  }
  if (template === null) return { ready: false, reason: 'template_missing' }
  return { ready: true, settings }
}
