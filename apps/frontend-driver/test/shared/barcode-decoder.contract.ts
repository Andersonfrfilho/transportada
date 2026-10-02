/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { decodeBarcodeFrame, type BarcodeFrame } from '@/components/ui/barcodeDecoder.service'
import { encodeCode128C, totalCode128Width } from '@/components/ui/code128.service'

/** Chave sintética de 44 dígitos — nenhuma nota real entra em teste. */
const ACCESS_KEY = '35260712345678000195550010009001231000000017'

const MODULE_PIXELS = 3
const QUIET_ZONE_MODULES = 10
const BARCODE_HEIGHT_PIXELS = 60

/**
 * Pinta as larguras do Code 128 (barra primeiro, alternando) num quadro de luminância igual ao que
 * a câmera entrega. Sem a zona de silêncio dos dois lados o zxing não acha o começo da etiqueta.
 */
function paintCode128Frame(digits: string): BarcodeFrame {
  const widths = encodeCode128C(digits)
  const width = (totalCode128Width(widths) + QUIET_ZONE_MODULES * 2) * MODULE_PIXELS
  /** Um byte por pixel, como `toLuminance` entrega — RGBA entraria quatro vezes mais largo. */
  const luminance = new Uint8ClampedArray(width * BARCODE_HEIGHT_PIXELS).fill(255)

  let column = QUIET_ZONE_MODULES * MODULE_PIXELS
  let isBar = true
  for (const moduleWidth of widths) {
    const span = moduleWidth * MODULE_PIXELS
    if (isBar) {
      for (let x = column; x < column + span; x += 1) {
        for (let y = 0; y < BARCODE_HEIGHT_PIXELS; y += 1) luminance[y * width + x] = 0
      }
    }
    column += span
    isBar = !isBar
  }

  return { height: BARCODE_HEIGHT_PIXELS, luminance, width }
}

describe('o leitor de código devolve a chave da etiqueta', () => {
  it('lê a chave de acesso de 44 dígitos num Code 128 como o da DANFE', () => {
    expect(decodeBarcodeFrame(paintCode128Frame(ACCESS_KEY))).toBe(ACCESS_KEY)
  })

  it('quadro em branco não inventa leitura', () => {
    const width = 120
    const height = 60
    expect(
      decodeBarcodeFrame({
        height,
        luminance: new Uint8ClampedArray(width * height).fill(255),
        width,
      }),
    ).toBeNull()
  })
})
