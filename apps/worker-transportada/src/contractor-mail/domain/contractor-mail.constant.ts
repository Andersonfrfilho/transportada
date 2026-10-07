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
 * Spec 237 T4.7a/T4.7c: o que se mede no cabeçalho do MIME ANTES de qualquer verificação de DKIM ou leitura.
 * O verificador passa os endereços pelo `addressparser` do nodemailer, quadrático em lista de endereços: 400 KB
 * de `a,a,a…` travaram o laço de eventos por 58 s. Cada assinatura DKIM custa um hasher de corpo por combinação
 * (canon, hash, `l=`) e uma consulta de DNS em série; por isso as assinaturas também têm teto.
 */
export const MIME_HEADER_LIMITS = {
  addressHeaderNames: [
    'bcc',
    'cc',
    'delivered-to',
    'from',
    'reply-to',
    'return-path',
    'sender',
    'to',
  ],
  maxAddressHeaderBytes: 2 * 1024,
  maxHeaderBytes: 8 * 1024,
  maxSectionBytes: 64 * 1024,
  /** Quantas vezes o nome pode aparecer: oito `DKIM-Signature` e três conjuntos `ARC-*`. */
  maxSignatureFields: {
    'arc-authentication-results': 3,
    'arc-message-signature': 3,
    'arc-seal': 3,
    'dkim-signature': 8,
  },
} as const
