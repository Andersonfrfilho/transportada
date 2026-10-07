/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 150 T302. Teto do `to` do `POST /emails` do Resend. Cópia por valor de
 * `api-transportada/src/contractor-mail/domain/contractor-mail.constant.ts`, cobrada por
 * `test/contractor-mail/max-recipients-parity.contract.ts`.
 */
export const CONTRACTOR_MAIL_MAX_RECIPIENTS = 50

/** O tipo do MIME bruto que o trilho de e-mail de entrada guarda no bucket e a mensagem encaminhada anexada. */
export const RAW_EMAIL_MIME_TYPE = 'message/rfc822'

/**
 * Spec 237 T4.7a: o que se mede no cabeçalho do MIME ANTES de qualquer verificação de DKIM. O verificador
 * passa `From`/`Return-Path` pelo `addressparser` do nodemailer, quadrático em lista de endereços: 400 KB de
 * `a,a,a…` travaram o laço de eventos por 58 s.
 */
export const MIME_HEADER_LIMITS = {
  addressHeaderNames: ['from', 'reply-to', 'return-path', 'sender'],
  maxAddressHeaderBytes: 2 * 1024,
  maxSectionBytes: 64 * 1024,
} as const
