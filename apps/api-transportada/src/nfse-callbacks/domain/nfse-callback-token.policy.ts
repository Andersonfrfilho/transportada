/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import type { NfseCallbackCredential } from '../application/nfse-callback.port.js'

const DIGEST_ENCODING = 'hex'
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

/** O que o banco guarda é o digest; o token em claro nunca é persistido nem comparado. */
export function hashCallbackToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest(DIGEST_ENCODING)
}

type MatchCallbackCredentialParams = {
  readonly credentials: readonly NfseCallbackCredential[]
  readonly digest: string
}

/**
 * Percorre todas as credenciais sem sair no primeiro acerto: parar cedo devolveria pelo tempo de
 * resposta a informação que o `timingSafeEqual` existe para esconder.
 */
export function matchCallbackCredential({
  credentials,
  digest,
}: MatchCallbackCredentialParams): string | undefined {
  const received = toDigestBuffer(digest)
  if (received === undefined) return undefined

  let matched: string | undefined
  for (const credential of credentials) {
    const candidate = toDigestBuffer(credential.callbackTokenSha256)
    const equal = candidate !== undefined && timingSafeEqual(received, candidate)
    matched = equal ? credential.companyId : matched
  }

  return matched
}

/** Digest fora do formato é linha corrompida, não segredo: `timingSafeEqual` exige tamanho igual. */
function toDigestBuffer(digest: string): Buffer | undefined {
  if (!DIGEST_PATTERN.test(digest)) return undefined
  return Buffer.from(digest, DIGEST_ENCODING)
}
