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
 * Spec 237 T4.7a/T4.7c/T4.7d: o que se mede no cabeçalho do MIME ANTES de qualquer verificação de DKIM ou leitura.
 * O verificador e o PostalMime passam os endereços pelo `addressparser`, quadrático em lista de endereços: 400 KB
 * de `a,a,a…` travaram o laço de eventos por 58 s; no pior padrão (`a=?b?c?d?=`) 2 KiB custam 2,4 ms, 8 KiB
 * 37 ms e 32 KiB 708 ms, e uma lista legítima de 150 destinatários com nome (9,3 KiB) menos de 0,4 ms. Por isso
 * o endereço que identifica (`from`, `sender`, `reply-to`, `return-path`) fica em 2 KiB e os destinatários
 * (`to`, `cc`, `bcc`, `delivered-to`) em 8 KiB por campo e 16 KiB na soma — responder a todos de uma lista
 * grande não perde DKIM nem anexos. Cada assinatura DKIM custa um hasher de corpo por combinação (canon, hash,
 * `l=`) e uma consulta de DNS em série; por isso as assinaturas também têm teto.
 */
export const MIME_HEADER_LIMITS = {
  identityHeaderNames: ['from', 'reply-to', 'return-path', 'sender'],
  maxHeaderBytes: 8 * 1024,
  maxIdentityHeaderBytes: 2 * 1024,
  maxRecipientHeaderBytes: 8 * 1024,
  maxRecipientHeadersTotalBytes: 16 * 1024,
  maxSectionBytes: 64 * 1024,
  /** Quantas vezes o nome pode aparecer: oito `DKIM-Signature` e três conjuntos `ARC-*`. */
  maxSignatureFields: {
    'arc-authentication-results': 3,
    'arc-message-signature': 3,
    'arc-seal': 3,
    'dkim-signature': 8,
  },
  recipientHeaderNames: ['bcc', 'cc', 'delivered-to', 'to'],
} as const

/**
 * Spec 237 T4.7d: o PostalMime é quadrático no número de partes e cada `message/rfc822` aninhada aberta custa
 * uma leitura inteira (5000 aninhadas = 25 s; 20 000 partes pequenas = 9 s). A contagem é de linhas que
 * começam com `--` — as únicas que o PostalMime reconhece como fronteira — e as aninhadas abertas dividem o
 * orçamento de uma mensagem, que é o teto de anexos da conversa.
 */
export const MIME_PART_LIMITS = {
  maxBoundaryLines: 200,
  maxNestedMessages: 5,
} as const
