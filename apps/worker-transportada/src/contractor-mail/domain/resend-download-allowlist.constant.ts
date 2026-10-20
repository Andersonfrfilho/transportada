/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 143 T007: a allowlist de host da `raw.download_url` — a defesa contra SSRF de um webhook
 * forjado (ADR-0063 § Segurança). A documentação de "retrieve received email"
 * (https://resend.com/docs/api-reference/emails/retrieve-received-email) descreve o campo como uma
 * "Signed CloudFront URL to download the raw email file", sem fixar o subdomínio exato — por isso a
 * lista aceita o domínio genérico da CloudFront, isolada aqui (nunca dentro do `fetch`) para ser o
 * único ponto a mudar se um payload real mostrar host diferente.
 *
 * Payload real (staging, 2026-10-20): `https://cdn.resend.app/receiving/raw/...`, domínio próprio do Resend
 * na frente da CloudFront — por isso `.resend.app` também entra.
 */
export const RESEND_RAW_DOWNLOAD_ALLOWED_HOST_SUFFIXES: readonly string[] = [
  '.cloudfront.net',
  '.resend.app',
]

export function isAllowedResendDownloadUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false

  return RESEND_RAW_DOWNLOAD_ALLOWED_HOST_SUFFIXES.some(
    (suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix),
  )
}
