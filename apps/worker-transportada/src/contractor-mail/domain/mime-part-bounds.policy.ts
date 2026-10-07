/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7d: o número de partes do MIME medido ANTES do leitor. O PostalMime só reconhece fronteira em linha
 * que começa com `--`, qualquer que seja o valor dela (inclusive com espaço), então contar essas linhas é uma
 * passada linear que não pode ser contornada pelo desenho do MIME. Conta a mais (texto citado, régua `----`), nunca
 * a menos.
 */
import { MIME_PART_LIMITS } from './contractor-mail.constant.js'

const LINE_START_DASHES = Buffer.from('\n--')
const DASHES = Buffer.from('--')

export function hasBoundedMimeParts(raw: Uint8Array): boolean {
  const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  let boundaryLines = buffer.subarray(0, DASHES.byteLength).equals(DASHES) ? 1 : 0
  let position = buffer.indexOf(LINE_START_DASHES)
  while (position !== -1) {
    boundaryLines += 1
    if (boundaryLines > MIME_PART_LIMITS.maxBoundaryLines) return false
    position = buffer.indexOf(LINE_START_DASHES, position + 1)
  }
  return boundaryLines <= MIME_PART_LIMITS.maxBoundaryLines
}
