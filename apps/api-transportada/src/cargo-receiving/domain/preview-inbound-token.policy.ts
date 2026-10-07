/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): o token do endereço de entrada da prévia nasce no servidor — 26 símbolos
 * base32 de 5 bits cada, 130 bits do CSPRNG — e só o hash fica no perfil. ⚠️ Cópia por valor da política do
 * worker (`preview-inbound-token.policy.ts`): o propósito entra no hash, e um contrato de paridade cobra os dois.
 */
import { createHash } from 'node:crypto'

export const PREVIEW_INBOUND_TOKEN_PATTERN = /^[a-z2-7]{26}$/u

/** O mesmo HMAC/derivação do token de conversa não vale aqui: o propósito entra no hash. */
export const PREVIEW_INBOUND_TOKEN_PURPOSE = 'transportada:cargo-preview-inbound:v1'

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const TOKEN_LENGTH = 26
const SYMBOL_MASK = 0b1_1111

/** 32 símbolos e máscara de 5 bits: cada símbolo é uniforme, sem o viés de um módulo. */
export function generatePreviewInboundToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))
  return Array.from(bytes, (byte) => TOKEN_ALPHABET.charAt(byte & SYMBOL_MASK)).join('')
}

/** Só o hash fica no perfil: o token em si nunca é guardado. */
export function hashPreviewInboundToken(token: string): string {
  return createHash('sha256').update(`${PREVIEW_INBOUND_TOKEN_PURPOSE}:${token}`).digest('hex')
}

export function buildPreviewInboundAddress(input: {
  readonly replyDomain: string
  readonly token: string
}): string {
  return `${input.token}@${input.replyDomain.trim().toLowerCase()}`
}
