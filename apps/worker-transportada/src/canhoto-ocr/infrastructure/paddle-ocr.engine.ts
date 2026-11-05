/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * PP-OCRv4 (detecção + reconhecimento) em `onnxruntime-web` WASM: a imagem do worker é Alpine/musl e o
 * `onnxruntime-node` só traz binário glibc (spike 294 T4.8b). Orientação pela forma das caixas (90°),
 * inclinação pela mediana dos ângulos, 180° pela confiança do reconhecimento.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { env as onnxEnvironment, InferenceSession, Tensor } from 'onnxruntime-web'
import sharp from 'sharp'

import { CANHOTO_OCR_LONG_SIDE, CANHOTO_OCR_MODEL_FILES } from '../domain/canhoto-ocr.constant.js'
import { detectTextBoxes } from './paddle-ocr-detector.js'
import { recognizeLines } from './paddle-ocr-recognizer.js'
import type { OcrEngine, OcrLine, RawImage, TextBox } from './paddle-ocr.types.js'

const SKEW_MIN_DEGREES = 1.5
const SKEW_MAX_DEGREES = 30
const FLIP_CONFIDENCE_CEILING = 0.75

export async function loadOcrEngine(modelDirectory: string): Promise<OcrEngine> {
  onnxEnvironment.wasm.numThreads = 1
  onnxEnvironment.logLevel = 'error'
  const options = { executionProviders: ['wasm' as const], logSeverityLevel: 3 as const }
  const load = async (file: string) =>
    InferenceSession.create(new Uint8Array(await readFile(join(modelDirectory, file))), options)
  const detector = await load(CANHOTO_OCR_MODEL_FILES.detector)
  const recognizer = await load(CANHOTO_OCR_MODEL_FILES.recognizer)
  const keys = (await readFile(join(modelDirectory, CANHOTO_OCR_MODEL_FILES.dictionary), 'utf8'))
    .split('\n')
    .filter((line) => line.length > 0)
  return {
    detector,
    dictionary: ['', ...keys, ' '],
    recognizer,
    tensor: (data, dims) => new Tensor('float32', data, [...dims]),
  }
}

async function toRaw(image: sharp.Sharp): Promise<RawImage> {
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, height: info.height, width: info.width }
}

const fromRaw = (image: RawImage): sharp.Sharp =>
  sharp(image.data, { raw: { channels: 3, height: image.height, width: image.width } })

function median(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0
}

const meanConfidence = (lines: readonly OcrLine[]): number =>
  lines.length === 0 ? 0 : lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length

function isTall(box: TextBox): boolean {
  return box.y1 - box.y0 > 1.5 * (box.x1 - box.x0)
}

async function levelImage(
  engine: OcrEngine,
  oriented: Buffer,
): Promise<{ readonly boxes: TextBox[]; readonly image: RawImage }> {
  let image = await toRaw(sharp(oriented))
  let boxes = await detectTextBoxes(engine, image)
  const tall = boxes.filter(isTall).length
  const wide = boxes.filter((box) => box.x1 - box.x0 > 1.5 * (box.y1 - box.y0)).length
  if (tall > wide) {
    image = await toRaw(sharp(oriented).rotate(90))
    boxes = await detectTextBoxes(engine, image)
  }
  const angles = boxes
    .filter((box) => box.x1 - box.x0 > 3 * (box.y1 - box.y0))
    .map((box) => box.angle)
  const skew = angles.length >= 3 ? median(angles) : 0
  if (Math.abs(skew) > SKEW_MIN_DEGREES && Math.abs(skew) < SKEW_MAX_DEGREES) {
    image = await toRaw(fromRaw(image).rotate(skew, { background: '#ffffff' }))
    boxes = await detectTextBoxes(engine, image)
  }
  return { boxes, image }
}

/** As linhas lidas, na ordem da página. Nada é gravado nem logado aqui. */
export async function readOcrLines(engine: OcrEngine, bytes: Uint8Array): Promise<OcrLine[]> {
  const oriented = await sharp(bytes)
    .rotate()
    .resize(CANHOTO_OCR_LONG_SIDE, CANHOTO_OCR_LONG_SIDE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer()
  const { boxes, image } = await levelImage(engine, oriented)
  const lines = await recognizeLines(engine, image, boxes)
  if (meanConfidence(lines) >= FLIP_CONFIDENCE_CEILING) return lines
  const flipped = await toRaw(fromRaw(image).rotate(180))
  const flippedLines = await recognizeLines(engine, flipped, await detectTextBoxes(engine, flipped))
  return meanConfidence(flippedLines) > meanConfidence(lines) ? flippedLines : lines
}
