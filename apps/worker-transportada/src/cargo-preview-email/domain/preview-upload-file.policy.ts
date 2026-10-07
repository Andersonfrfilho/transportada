/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do que `cargo-preview-upload.policy.ts` e `cargo-preview-open-limit.support.ts` da
 * API decidem sobre o arquivo da prévia: assinatura zip, nome sem caminho, impressão do pedido, limite de
 * abertas e a trava do envio. O e-mail cria a prévia pelo MESMO contrato do upload; o contrato de
 * paridade cobra cada trecho. O teto de bytes é o de `CARGO_PREVIEW_OBJECT_MAX_BYTES`.
 */
import { createHash } from 'node:crypto'

import { CARGO_PREVIEW_LIMITS } from '../../shared/cargo-preview.constant.js'

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const
const FALLBACK_FILE_NAME = 'preview'
const CONTROL_CHARACTERS = /\p{Cc}/gu
const PATH_SEPARATOR = /[/\\]/u

export function hasZipSignature(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
}

/** Só o nome: o caminho que o cliente de e-mail manda some, e controle vira nada. */
export function sanitizePreviewFileName(rawName: string): string {
  const baseName = rawName.split(PATH_SEPARATOR).at(-1) ?? ''
  const cleaned = baseName.replace(CONTROL_CHARACTERS, '').trim()
  const limited = [...cleaned].slice(0, CARGO_PREVIEW_LIMITS.fileNameMaxLength).join('').trim()
  return limited.length === 0 ? FALLBACK_FILE_NAME : limited
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** A mesma chave com outro contratante ou outro arquivo é reuso, não repetição. */
export function buildPreviewRequestFingerprint(input: {
  readonly contractorId: string
  readonly fileSha256: string
}): string {
  return sha256Hex(JSON.stringify([input.contractorId, input.fileSha256]))
}

/** Prévias de um contratante na fila ou em leitura ao mesmo tempo (revisão de segurança S5). */
export const CARGO_PREVIEW_OPEN_LIMIT = 5

const CARGO_PREVIEW_UPLOAD_LOCK_PREFIX = 'cargo-preview-upload'

/** A trava do envio de um contratante: contar as abertas e gravar a nova sem outro envio no meio. */
export function buildCargoPreviewUploadLockKey(input: {
  readonly companyId: string
  readonly contractorId: string
}): string {
  return `${CARGO_PREVIEW_UPLOAD_LOCK_PREFIX}:${input.companyId}:${input.contractorId}`
}
