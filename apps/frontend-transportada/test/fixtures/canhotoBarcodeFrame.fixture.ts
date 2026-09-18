/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Imagem sintética de DANFE para o contrato de `canhotoIdentification.service.ts` (spec 156 T10).
 *
 * `@zxing/library` 0.23.0 (a versão instalada) não expõe `Code128Writer` — só os leitores. O
 * gerador manual já existe no produto (`code128.service.ts`, usado para desenhar o código de barras
 * na tela e no romaneio) e é reaproveitado aqui: `encodeCode128C` devolve as larguras em módulos, e
 * este fixture só as transforma em pixels (`BarcodeFrame`) para o `decodeBarcodeFrame` real ler de
 * volta — sem PNG, sem canvas, determinístico.
 */
import { encodeCode128C } from '@/components/ui/code128.service'
import type { BarcodeFrame } from '@/components/ui/barcodeDecoder.service'

const MODULE_WIDTH_PIXELS = 3
const QUIET_ZONE_MODULES = 12
const BARCODE_HEIGHT_PIXELS = 40
const BLACK = 0
const WHITE = 255

/** Larguras em módulos, começando por barra e alternando — mesma convenção de `code128.service.ts`. */
function solidRun(pixelWidth: number, level: number): number[] {
  return Array.from<number>({ length: pixelWidth }).fill(level)
}

function toLuminanceRow(moduleWidths: readonly number[]): number[] {
  const quietZone = QUIET_ZONE_MODULES * MODULE_WIDTH_PIXELS
  const row: number[] = solidRun(quietZone, WHITE)
  let isBar = true
  for (const width of moduleWidths) {
    row.push(...solidRun(width * MODULE_WIDTH_PIXELS, isBar ? BLACK : WHITE))
    isBar = !isBar
  }
  row.push(...solidRun(quietZone, WHITE))
  return row
}

/** Chave de 44 dígitos → quadro de câmera com o Code128-C correspondente, pronto para `decodeBarcodeFrame`. */
export function buildAccessKeyBarcodeFrame(accessKey: string): BarcodeFrame {
  const row = toLuminanceRow(encodeCode128C(accessKey))
  const width = row.length
  const luminance = new Uint8ClampedArray(width * BARCODE_HEIGHT_PIXELS)
  for (let line = 0; line < BARCODE_HEIGHT_PIXELS; line += 1) {
    luminance.set(row, line * width)
  }
  return { height: BARCODE_HEIGHT_PIXELS, luminance, width }
}

/** Nenhum canhoto destacado tem código de barras — é o caso mais comum no escritório (ADR-0067 §Riscos). */
export function buildBlankBarcodeFrame(): BarcodeFrame {
  const width = QUIET_ZONE_MODULES * MODULE_WIDTH_PIXELS * 2
  return {
    height: BARCODE_HEIGHT_PIXELS,
    luminance: new Uint8ClampedArray(width * BARCODE_HEIGHT_PIXELS).fill(WHITE),
    width,
  }
}
