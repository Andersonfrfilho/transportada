/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010 (RF11, ADR-0063 §7): a assinatura do webhook `email.received` do Resend segue o
 * padrão do Svix — HMAC-SHA256 sobre `${svix-id}.${svix-timestamp}.${corpo cru}`, com o segredo em
 * base64 depois do prefixo `whsec_`. Pura, sem I/O: recebe o segredo já aberto e o corpo já lido —
 * quem abre o envelope e lê o `rawBody` é a rota, uma vez cada. **Sem a biblioteca `svix`**: são
 * poucas linhas de `node:crypto`, e a dependência não se paga.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const WEBHOOK_SIGNING_SECRET_PREFIX = 'whsec_'
const SIGNATURE_SCHEME_PREFIX = 'v1,'
/** RF11: 5 minutos, para mais e para menos. */
const TOLERANCE_SECONDS = 5 * 60

export const SVIX_SIGNATURE_VERIFICATION_FAILURE = {
  MALFORMED_SECRET: 'malformed_secret',
  MISSING_HEADERS: 'missing_headers',
  SIGNATURE_MISMATCH: 'signature_mismatch',
  TIMESTAMP_OUT_OF_WINDOW: 'timestamp_out_of_window',
} as const

export type SvixSignatureVerificationFailure =
  (typeof SVIX_SIGNATURE_VERIFICATION_FAILURE)[keyof typeof SVIX_SIGNATURE_VERIFICATION_FAILURE]

export type VerifySvixSignatureInput = {
  readonly now?: Date
  readonly rawBody: string
  readonly svixId: string
  readonly svixSignature: string
  readonly svixTimestamp: string
  readonly webhookSigningSecret: string
}

export type VerifySvixSignatureResult =
  | { readonly verified: true }
  | { readonly reason: SvixSignatureVerificationFailure; readonly verified: false }

/**
 * Revisão do `architect` (T010): separada de `verifySvixSignature` para a rota rejeitar barato
 * **antes** de consultar o banco — presença/formato dos cabeçalhos e a janela de 5 minutos não
 * precisam do segredo da empresa, então não há por que pagar `lookupSettings` + abrir o envelope
 * para um `POST` sem `svix-*` de verdade ou com timestamp velho repetido.
 */
export function checkSvixHeadersAndWindow(input: {
  readonly now?: Date
  readonly svixId: string
  readonly svixSignature: string
  readonly svixTimestamp: string
}): VerifySvixSignatureResult {
  if (input.svixId === '' || input.svixSignature === '' || input.svixTimestamp === '') {
    return { reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.MISSING_HEADERS, verified: false }
  }

  const timestampSeconds = Number.parseInt(input.svixTimestamp, 10)
  if (!Number.isFinite(timestampSeconds) || String(timestampSeconds) !== input.svixTimestamp) {
    return { reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.TIMESTAMP_OUT_OF_WINDOW, verified: false }
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) {
    return { reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.TIMESTAMP_OUT_OF_WINDOW, verified: false }
  }

  return { verified: true }
}

/**
 * Revisão do `architect`: a metade cara — decodificar o segredo e computar o HMAC — só roda depois
 * de `checkSvixHeadersAndWindow` aprovar. Não repete a checagem de cabeçalho/janela.
 */
export function verifySvixSignatureHmac(input: {
  readonly rawBody: string
  readonly svixId: string
  readonly svixSignature: string
  readonly svixTimestamp: string
  readonly webhookSigningSecret: string
}): VerifySvixSignatureResult {
  if (!input.webhookSigningSecret.startsWith(WEBHOOK_SIGNING_SECRET_PREFIX)) {
    return { reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.MALFORMED_SECRET, verified: false }
  }

  const secretKey = Buffer.from(
    input.webhookSigningSecret.slice(WEBHOOK_SIGNING_SECRET_PREFIX.length),
    'base64',
  )
  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`
  const expectedSignature = createHmac('sha256', secretKey).update(signedContent).digest()

  const candidates = input.svixSignature
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(SIGNATURE_SCHEME_PREFIX))
    .map((entry) => Buffer.from(entry.slice(SIGNATURE_SCHEME_PREFIX.length), 'base64'))

  const matches = candidates.some(
    (candidate) =>
      candidate.length === expectedSignature.length &&
      timingSafeEqual(candidate, expectedSignature),
  )
  if (!matches) {
    return { reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.SIGNATURE_MISMATCH, verified: false }
  }
  return { verified: true }
}

/**
 * A checagem do timestamp vem **antes** do HMAC (RF11): rejeitar por janela é mais barato que
 * computar HMAC para um corpo já fora do prazo, e evita que o próprio custo de CPU do HMAC vire
 * vetor de negação de serviço sobre um timestamp velho replicado sem parar. Mantida para quem quer
 * o veredito completo numa chamada só (os testes de política); a rota, depois da revisão do
 * `architect`, chama as duas metades em separado — ver `process-inbound-email-webhook.use-case.ts`.
 */
export function verifySvixSignature(input: VerifySvixSignatureInput): VerifySvixSignatureResult {
  const precondition = checkSvixHeadersAndWindow(input)
  if (!precondition.verified) return precondition
  return verifySvixSignatureHmac(input)
}
