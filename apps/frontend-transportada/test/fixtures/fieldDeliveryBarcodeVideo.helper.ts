/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T12 (aceite 5): a câmera simulada do Chromium (`--use-fake-device-for-media-stream` +
 * `--use-file-for-fake-video-capture`) só aceita y4m/mjpeg em disco — não um `MediaStream` do
 * navegador. Este helper gera esse arquivo a partir da mesma fixture de DANFE da T10
 * (`canhotoBarcodeFrame.fixture.ts`, Code128-C sintético, sem PNG/canvas), colando o quadro do
 * código de barras no centro de um Y4M cinza 4:2:0 de um quadro só — suficiente porque o Chromium
 * repete o último quadro do arquivo enquanto o `MediaStream` estiver aberto.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildAccessKeyBarcodeFrame } from './canhotoBarcodeFrame.fixture'

const FRAME_WIDTH = 640
const FRAME_HEIGHT = 480
const NEUTRAL_CHROMA = 128
const WHITE = 255

function buildLumaPlane(
  barcodeLuminance: Uint8ClampedArray,
  barcodeWidth: number,
  barcodeHeight: number,
): Uint8Array {
  const plane = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT).fill(WHITE)
  const left = Math.max(0, Math.floor((FRAME_WIDTH - barcodeWidth) / 2))
  const top = Math.max(0, Math.floor((FRAME_HEIGHT - barcodeHeight) / 2))
  for (let row = 0; row < barcodeHeight && top + row < FRAME_HEIGHT; row += 1) {
    for (let column = 0; column < barcodeWidth && left + column < FRAME_WIDTH; column += 1) {
      const targetIndex = (top + row) * FRAME_WIDTH + (left + column)
      const sourceIndex = row * barcodeWidth + column
      plane[targetIndex] = barcodeLuminance[sourceIndex] ?? WHITE
    }
  }
  return plane
}

/** Y4M `C420jpeg`: um quadro I420 — luma cheia, croma pela metade em cada eixo, tudo neutro. */
function buildY4mFile(
  barcodeLuminance: Uint8ClampedArray,
  barcodeWidth: number,
  barcodeHeight: number,
): Buffer {
  const yPlane = buildLumaPlane(barcodeLuminance, barcodeWidth, barcodeHeight)
  const chromaSize = (FRAME_WIDTH / 2) * (FRAME_HEIGHT / 2)
  const uPlane = new Uint8Array(chromaSize).fill(NEUTRAL_CHROMA)
  const vPlane = new Uint8Array(chromaSize).fill(NEUTRAL_CHROMA)
  const header = Buffer.from(`YUV4MPEG2 W${FRAME_WIDTH} H${FRAME_HEIGHT} F25:1 Ip A1:1 C420jpeg\n`)
  const frameHeader = Buffer.from('FRAME\n')
  return Buffer.concat([
    header,
    frameHeader,
    Buffer.from(yPlane),
    Buffer.from(uPlane),
    Buffer.from(vPlane),
  ])
}

/**
 * Escreve o vídeo no diretório temporário do sistema e devolve o caminho, pronto para
 * `--use-file-for-fake-video-capture=<path>` no `launchOptions.args` do Playwright.
 */
export function writeFieldDeliveryBarcodeVideo(accessKey: string): string {
  const frame = buildAccessKeyBarcodeFrame(accessKey)
  const file = buildY4mFile(frame.luminance, frame.width, frame.height)
  const directory = join(tmpdir(), 'transportada-field-delivery-smoke')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${accessKey}.y4m`)
  writeFileSync(path, file)
  return path
}
