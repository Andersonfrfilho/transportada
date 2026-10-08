/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (RF2): o endereço de entrada da prévia é o token inteiro no local-part do domínio de
 * entrada — o mesmo formato de 26 caracteres base32 do token de conversa, mas num espaço de hash
 * próprio (o propósito entra no hash), então um token de conversa nunca abre um perfil de prévia e o
 * contrário também não. `+` não passa: o alias do Gmail não é endereço de perfil.
 */
import { createHash } from 'node:crypto'

import {
  PREVIEW_INBOUND_TOKEN_PATTERN,
  PREVIEW_INBOUND_TOKEN_PURPOSE,
} from './cargo-preview-email.constant.js'

export function extractPreviewTokenCandidates(input: {
  readonly ccAddresses?: readonly string[]
  readonly replyDomain: string
  readonly toAddresses: readonly string[]
}): readonly string[] {
  const replyDomain = input.replyDomain.trim().toLowerCase()
  const candidates = new Set<string>()

  for (const address of [...input.toAddresses, ...(input.ccAddresses ?? [])]) {
    const email = extractEmailAddress(address)
    const atIndex = email.lastIndexOf('@')
    if (atIndex <= 0) continue
    if (email.slice(atIndex + 1).toLowerCase() !== replyDomain) continue
    const localPart = email.slice(0, atIndex).toLowerCase()
    if (PREVIEW_INBOUND_TOKEN_PATTERN.test(localPart)) candidates.add(localPart)
  }

  return [...candidates]
}

/** Só o hash fica no perfil: o token em si nunca é guardado. */
export function hashPreviewInboundToken(token: string): string {
  return createHash('sha256').update(`${PREVIEW_INBOUND_TOKEN_PURPOSE}:${token}`).digest('hex')
}

function extractEmailAddress(value: string): string {
  const angleMatch = /<([^<>]+)>/u.exec(value)
  return (angleMatch?.[1] ?? value).trim()
}
