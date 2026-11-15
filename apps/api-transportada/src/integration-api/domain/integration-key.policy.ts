/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomBytes } from 'node:crypto'

import type { IntegrationKeyScope } from '../../database/integration-api-key.schema.js'

/** Prefixo legível: quem achar a chave num repositório sabe do que se trata (e a varredura de segredos a acha). */
export const INTEGRATION_KEY_PREFIX = 'tms_'
const DISPLAY_PREFIX_LENGTH = 12
const KEY_BODY_BYTES = 32
/** `tms_` + 43 caracteres base64url (256 bits). */
const KEY_PATTERN = /^tms_[A-Za-z0-9_-]{43}$/

export type GeneratedIntegrationKey = {
  readonly hash: string
  /** A chave inteira. Aparece uma vez, na resposta da criação; nada a guarda. */
  readonly plain: string
  readonly prefix: string
}

export function generateIntegrationKey(): GeneratedIntegrationKey {
  const plain = `${INTEGRATION_KEY_PREFIX}${randomBytes(KEY_BODY_BYTES).toString('base64url')}`
  return { hash: hashIntegrationKey(plain), plain, prefix: plain.slice(0, DISPLAY_PREFIX_LENGTH) }
}

/**
 * SHA-256 simples basta: a chave tem 256 bits de entropia, então não há dicionário a desacelerar — diferente de uma
 * senha digitada. A busca é por igualdade do hash no índice único.
 */
export function hashIntegrationKey(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

/** `Authorization: Bearer tms_…`; qualquer outra forma é "sem chave" (o 401 não diz o que faltou). */
export function readIntegrationKey(header: string | null): string | null {
  if (header === null) return null
  const match = /^Bearer (\S+)$/.exec(header.trim())
  const candidate = match?.[1]
  return candidate !== undefined && KEY_PATTERN.test(candidate) ? candidate : null
}

export function integrationKeyHasScope(
  scopes: readonly IntegrationKeyScope[],
  scope: IntegrationKeyScope,
): boolean {
  return scopes.includes(scope)
}
