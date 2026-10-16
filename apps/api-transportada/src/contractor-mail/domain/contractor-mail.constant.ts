/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 150 T302. Teto do `to` do `POST /emails` do Resend. Cópia por valor em
 * `worker-transportada/src/contractor-mail/domain/contractor-mail.constant.ts`, que o cobra de novo
 * no gateway; o contrato de paridade fica no worker.
 */
export const CONTRACTOR_MAIL_MAX_RECIPIENTS = 50

/**
 * Spec 268: por onde o worker envia a mensagem. `sandbox_smtp` só nasce com `CONTRACTOR_MAIL_SANDBOX_SMTP`
 * ligado (nunca em produção) e sai pelo SMTP do ambiente. Cópia por valor no worker.
 */
export const CONTRACTOR_MAIL_TRANSPORTS = ['resend', 'sandbox_smtp'] as const
export type ContractorMailTransport = (typeof CONTRACTOR_MAIL_TRANSPORTS)[number]
export const CONTRACTOR_MAIL_DEFAULT_TRANSPORT: ContractorMailTransport = 'resend'
