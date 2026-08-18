/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O changelog da v2 diz que `/xml` e `/pdf` devolvem o documento em base64, e a Nota RP não tem
 * homologação onde conferir antes da primeira nota real. Conferir a assinatura vale nos dois casos:
 * o que já abre como documento passa direto, o que não abre só é aceito se decodificar em algo que
 * abra. Sem isto, o base64 seria arquivado sob `application/xml` sem erro nenhum no caminho — e o
 * XML é o documento fiscal.
 */

export type NfseDocumentKind = 'pdf' | 'xml'

/** A abertura de cada formato: é ela que separa o documento do texto que fala sobre o documento. */
const DOCUMENT_SIGNATURE: Readonly<Record<NfseDocumentKind, readonly number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  xml: [0x3c],
}

/** Tabulação, quebra de linha, espaço e os três bytes do BOM: legítimos antes da abertura do XML. */
const LEADING_NOISE = new Set([0x09, 0x0a, 0x0d, 0x20, 0xbb, 0xbf, 0xef])

export function resolveNfseDocumentBytes(input: {
  readonly bytes: Uint8Array
  readonly kind: NfseDocumentKind
}): Uint8Array | undefined {
  if (hasDocumentSignature(input)) return input.bytes

  const decoded = decodeBase64(input.bytes)
  if (decoded === undefined) return undefined

  return hasDocumentSignature({ bytes: decoded, kind: input.kind }) ? decoded : undefined
}

function hasDocumentSignature(input: {
  readonly bytes: Uint8Array
  readonly kind: NfseDocumentKind
}): boolean {
  const start = skipLeadingNoise(input.bytes)
  return DOCUMENT_SIGNATURE[input.kind].every(
    (byte, index) => input.bytes[start + index] === byte,
  )
}

function skipLeadingNoise(bytes: Uint8Array): number {
  let index = 0
  while (index < bytes.length && LEADING_NOISE.has(bytes[index] ?? -1)) index += 1
  return index
}

function decodeBase64(bytes: Uint8Array): Uint8Array | undefined {
  const decoded = Buffer.from(new TextDecoder().decode(bytes).trim(), 'base64')
  return decoded.length === 0 ? undefined : new Uint8Array(decoded)
}
