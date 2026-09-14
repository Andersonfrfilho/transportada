/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 143 T007. Cópia por valor do vocabulário de `api-transportada/src/contractor-mail/domain/resend-provider.error.ts`
 * — as duas apps não importam código-fonte uma da outra. Os três primeiros cobrem `sendEmail` e
 * `fetchReceivedEmail`; os três últimos são só de `downloadRawEmail`, porque a SSRF (ADR-0063 §
 * Segurança) exige recusar **antes** de qualquer rede, não só interpretar uma resposta ruim.
 */
export class ResendProviderUnauthorizedError extends Error {
  public constructor() {
    super('Resend rejected the API key')
    this.name = 'ResendProviderUnauthorizedError'
  }
}

export class ResendProviderUnreachableError extends Error {
  public constructor(cause?: unknown) {
    super('Resend was not reachable', { cause })
    this.name = 'ResendProviderUnreachableError'
  }
}

export class ResendProviderUnexpectedResponseError extends Error {
  public constructor(cause?: unknown) {
    super('Resend responded with a body outside the expected schema', { cause })
    this.name = 'ResendProviderUnexpectedResponseError'
  }
}

/** `downloadUrl` fora da allowlist, ou não `https:` — a URL nunca chega a ser buscada. */
export class ResendDownloadHostNotAllowedError extends Error {
  public constructor() {
    super('Resend raw download URL host is not allowed')
    this.name = 'ResendDownloadHostNotAllowedError'
  }
}

/** Nenhum redirecionamento é seguido — nem para um host da allowlist. */
export class ResendDownloadRedirectBlockedError extends Error {
  public constructor() {
    super('Resend raw download response redirected')
    this.name = 'ResendDownloadRedirectBlockedError'
  }
}

/** Teto de 25 MiB (o limite de entrada que Resend/Cloudflare já usam do lado deles). */
export class ResendDownloadTooLargeError extends Error {
  public constructor() {
    super('Resend raw download exceeded the size limit')
    this.name = 'ResendDownloadTooLargeError'
  }
}
