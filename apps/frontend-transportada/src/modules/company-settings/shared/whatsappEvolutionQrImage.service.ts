/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A política de conteúdo do painel não admite `data:` em `img-src` (T14, spec 183), só `blob:`.
 * O QR chega da API como `data:image/png;base64,…`; aqui ele vira bytes e uma URL de objeto, que
 * a política deixa desenhar. Entrada que não é PNG em base64 devolve `null` (a tela mostra o aviso).
 */
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/

export function decodeWhatsAppQrPng(dataUrl: string): Uint8Array<ArrayBuffer> | null {
  const match = PNG_DATA_URL.exec(dataUrl)
  if (match === null || match[1] === undefined) return null
  try {
    const binary = atob(match[1])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

export function createWhatsAppQrObjectUrl(dataUrl: string): string | null {
  const bytes = decodeWhatsAppQrPng(dataUrl)
  if (bytes === null) return null
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
}
