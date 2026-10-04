/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0094 §7): o que a API decide sobre o arquivo antes de guardá-lo — tamanho, tipo
 * pelos bytes (nunca `Content-Type` nem extensão), nome sem caminho e a chave opaca do objeto. A API
 * não abre a planilha: quem lê é o worker.
 */
import { createHash } from 'node:crypto'

import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES } from '../../shared/api.constant.js'
import {
  CARGO_PREVIEW_LIMITS,
  CARGO_PREVIEW_MATCH_LOCK_PREFIX,
  CARGO_PREVIEW_STATUS,
  type CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'
import { CARGO_PREVIEW_WORKBOOK_LIMITS } from './cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError } from './cargo-preview-workbook.error.js'

/** O cabeçalho do multipart (campos, fronteiras) cabe nesta folga sob o teto do corpo. */
const MULTIPART_ENVELOPE_BYTES = 64 * 1024

/**
 * O teto do arquivo é o menor entre o do leitor (5 MiB) e o do transporte: o corpo da API para em
 * 1 MiB antes da rota, e prometer 5 MiB aqui seria um 413 sem código nosso. As planilhas medidas têm
 * 0,80–0,82 MB.
 */
export const CARGO_PREVIEW_UPLOAD_MAX_BYTES = Math.min(
  CARGO_PREVIEW_WORKBOOK_LIMITS.fileBytes,
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES - MULTIPART_ENVELOPE_BYTES,
)

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const
const FALLBACK_FILE_NAME = 'preview'
const CONTROL_CHARACTERS = /\p{Cc}/gu
const PATH_SEPARATOR = /[/\\]/u

export function assertPreviewWorkbookBytes(bytes: Uint8Array): void {
  if (bytes.length > CARGO_PREVIEW_UPLOAD_MAX_BYTES) {
    throw new CargoPreviewWorkbookError('PREVIEW_FILE_TOO_LARGE')
  }
  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  }
}

/** Só o nome: o caminho que o navegador manda some, e controle vira nada. */
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

/** A chave do objeto não carrega nome de arquivo nem dado de ninguém (`security.md` §7). */
export function buildCargoPreviewObjectKey(input: {
  readonly companyId: string
  readonly fileObjectId: string
}): string {
  return `tenants/${input.companyId}/cargo-previews/${input.fileObjectId}`
}

/** A chave da trava advisory do vínculo de um contratante — a mesma no worker (paridade). */
export function buildCargoPreviewMatchLockKey(input: {
  readonly companyId: string
  readonly contractorId: string
}): string {
  return `${CARGO_PREVIEW_MATCH_LOCK_PREFIX}:${input.companyId}:${input.contractorId}`
}

/**
 * A leitura que não dá notícia há mais que isto foi perdida (o worker caiu no meio, ou a fila esgotou
 * sem marcar): a fila inteira — 6 tentativas com 10 s entre elas e até 5 s de leitura — cabe com folga.
 */
export const CARGO_PREVIEW_PROCESSING_LEASE_MS = 15 * 60_000

/** O mesmo arquivo reenviado reabre a prévia que falhou ou cuja leitura se perdeu; o resto é repetição. */
export function canReopenCargoPreview(input: {
  readonly now: Date
  readonly status: CargoPreviewStatus
  readonly updatedAt: Date
}): boolean {
  if (input.status === CARGO_PREVIEW_STATUS.failed) return true
  return (
    input.status === CARGO_PREVIEW_STATUS.processing &&
    input.now.getTime() - input.updatedAt.getTime() > CARGO_PREVIEW_PROCESSING_LEASE_MS
  )
}
