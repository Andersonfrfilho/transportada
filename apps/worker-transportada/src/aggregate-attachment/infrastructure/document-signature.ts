/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 071: a escolha entre camada de texto e OCR é **pela assinatura do arquivo**, não pelo tipo
 * declarado. O tipo vem de cliente anônimo e o `content-type` do upload vem com ele; os bytes são a
 * única coisa que não se pede por favor.
 *
 * O `tesseract-server` não lê PDF (`Pdf reading is not supported`, medido contra o serviço), então
 * mandar um para lá é round-trip sabendo que vai falhar.
 */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46] as const
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

export function isPdfDocument(bytes: Uint8Array): boolean {
  return startsWith(bytes, PDF_SIGNATURE)
}

/**
 * O `mimeType` que o OCR precisa sai dos bytes. Formato que não reconhecemos não vai ao serviço:
 * ele responderia erro, e erro de formato viraria retry de uma mensagem que nunca vai dar certo.
 */
export function imageMimeType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg'

  return undefined
}
