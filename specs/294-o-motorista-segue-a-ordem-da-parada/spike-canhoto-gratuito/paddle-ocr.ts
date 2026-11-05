/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// Spike T4.8b — PP-OCRv4 (det + rec) via onnxruntime-web (WASM) + sharp, sem OpenCV.
import { readFileSync } from 'node:fs'

import sharp from 'sharp'
import * as ortWeb from 'onnxruntime-web'

type Ort = typeof ortWeb
export type Box = { x0: number; y0: number; x1: number; y1: number; score: number; angle: number }
export type Line = { text: string; confidence: number; box: Box }
export type OcrEngine = {
  det: ortWeb.InferenceSession
  rec: ortWeb.InferenceSession
  dict: string[]
  ort: Ort
}

const DET_LIMIT = Number(process.env.DET_LIMIT ?? 960)
const DET_THRESHOLD = 0.3
const BOX_THRESHOLD = 0.5
const UNCLIP = 1.6
const REC_HEIGHT = 48
const MAX_BOXES = 160

export async function loadEngine(ort: Ort, modelDir: string): Promise<OcrEngine> {
  const options = { executionProviders: ['wasm' as const] }
  const det = await ort.InferenceSession.create(
    new Uint8Array(readFileSync(`${modelDir}/ch_PP-OCRv4_det_infer.onnx`)),
    options,
  )
  const rec = await ort.InferenceSession.create(
    new Uint8Array(readFileSync(`${modelDir}/ch_PP-OCRv4_rec_infer.onnx`)),
    options,
  )
  const keys = readFileSync(`${modelDir}/ppocr_keys_v1.txt`, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
  return { det, rec, dict: ['', ...keys, ' '], ort }
}

type Raw = { data: Buffer; width: number; height: number }

async function toRaw(image: sharp.Sharp): Promise<Raw> {
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

export async function detect(engine: OcrEngine, raw: Raw): Promise<Box[]> {
  const scale = Math.min(1, DET_LIMIT / Math.max(raw.width, raw.height))
  const width = Math.max(32, Math.round((raw.width * scale) / 32) * 32)
  const height = Math.max(32, Math.round((raw.height * scale) / 32) * 32)
  const resized = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer()
  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const input = new Float32Array(3 * width * height)
  for (let i = 0; i < width * height; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      // PaddleOCR lê em BGR
      input[c * width * height + i] =
        ((resized[i * 3 + (2 - c)] ?? 0) / 255 - (mean[c] ?? 0)) / (std[c] ?? 1)
    }
  }
  const feeds = {
    [engine.det.inputNames[0] as string]: new engine.ort.Tensor('float32', input, [
      1,
      3,
      height,
      width,
    ]),
  }
  const output = await engine.det.run(feeds)
  const map = output[engine.det.outputNames[0] as string]?.data as Float32Array
  const seen = new Uint8Array(width * height)
  const boxes: Box[] = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] === 1 || (map[start] ?? 0) <= DET_THRESHOLD) continue
    seen[start] = 1
    stack.push(start)
    let count = 0,
      sum = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0
    while (stack.length > 0) {
      const p = stack.pop() as number
      const x = p % width,
        y = (p - x) / width
      count += 1
      sum += map[p] ?? 0
      sx += x
      sy += y
      sxx += x * x
      syy += y * y
      sxy += x * y
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === width - 1)) continue
        if (seen[q] === 1 || (map[q] ?? 0) <= DET_THRESHOLD) continue
        seen[q] = 1
        stack.push(q)
      }
    }
    if (count < 12 || sum / count < BOX_THRESHOLD) continue
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1
    if (Math.min(w, h) < 3) continue
    const mx = sx / count,
      my = sy / count
    const cxx = sxx / count - mx * mx,
      cyy = syy / count - my * my,
      cxy = sxy / count - mx * my
    const angle = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI
    const offset = (w * h * UNCLIP) / (2 * (w + h))
    const fx = raw.width / width,
      fy = raw.height / height
    boxes.push({
      x0: Math.max(0, Math.floor((x0 - offset) * fx)),
      y0: Math.max(0, Math.floor((y0 - offset) * fy)),
      x1: Math.min(raw.width - 1, Math.ceil((x1 + offset) * fx)),
      y1: Math.min(raw.height - 1, Math.ceil((y1 + offset) * fy)),
      score: sum / count,
      angle,
    })
  }
  return boxes
}

async function recognize(engine: OcrEngine, raw: Raw, boxes: Box[]): Promise<Line[]> {
  const lines: Line[] = []
  const picked = [...boxes]
    .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
    .slice(0, MAX_BOXES)
  const base = sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } })
  for (const box of picked) {
    const w = box.x1 - box.x0 + 1,
      h = box.y1 - box.y0 + 1
    const recWidth = Math.min(960, Math.max(16, Math.ceil((REC_HEIGHT * w) / h / 8) * 8))
    const crop = await base
      .clone()
      .extract({ left: box.x0, top: box.y0, width: w, height: h })
      .resize(recWidth, REC_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer()
    const input = new Float32Array(3 * REC_HEIGHT * recWidth)
    for (let i = 0; i < REC_HEIGHT * recWidth; i += 1) {
      for (let c = 0; c < 3; c += 1)
        input[c * REC_HEIGHT * recWidth + i] = ((crop[i * 3 + (2 - c)] ?? 0) / 255 - 0.5) / 0.5
    }
    const feeds = {
      [engine.rec.inputNames[0] as string]: new engine.ort.Tensor('float32', input, [
        1,
        3,
        REC_HEIGHT,
        recWidth,
      ]),
    }
    const output = (await engine.rec.run(feeds))[
      engine.rec.outputNames[0] as string
    ] as ortWeb.Tensor
    const [, steps, classes] = output.dims as [number, number, number]
    const probs = output.data as Float32Array
    let text = '',
      confSum = 0,
      confCount = 0,
      last = -1
    for (let t = 0; t < steps; t += 1) {
      let best = 0,
        bestP = -1
      for (let k = 0; k < classes; k += 1) {
        const p = probs[t * classes + k] ?? 0
        if (p > bestP) {
          bestP = p
          best = k
        }
      }
      if (best !== 0 && best !== last) {
        text += engine.dict[best] ?? ''
        confSum += bestP
        confCount += 1
      }
      last = best
    }
    if (text.trim().length > 0)
      lines.push({ text, confidence: confCount === 0 ? 0 : confSum / confCount, box })
  }
  return lines.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

export type OcrResult = { lines: Line[]; rotation: number; deskew: number; passes: number }

/** Orientação pela forma das caixas, inclinação pela mediana dos ângulos, 180° pela confiança do rec. */
export async function readImage(
  engine: OcrEngine,
  image: Buffer,
  longSide = 1600,
): Promise<OcrResult> {
  const oriented = await sharp(image)
    .rotate()
    .resize(longSide, longSide, { fit: 'inside', withoutEnlargement: true })
    .toBuffer()
  let raw = await toRaw(sharp(oriented))
  let boxes = await detect(engine, raw)
  let passes = 1
  let rotation = 0
  const tall = boxes.filter((b) => b.y1 - b.y0 > 1.5 * (b.x1 - b.x0)).length
  const wide = boxes.filter((b) => b.x1 - b.x0 > 1.5 * (b.y1 - b.y0)).length
  if (tall > wide) {
    rotation = 90
    raw = await toRaw(sharp(oriented).rotate(90))
    boxes = await detect(engine, raw)
    passes += 1
  }
  const angles = boxes.filter((b) => b.x1 - b.x0 > 3 * (b.y1 - b.y0)).map((b) => b.angle)
  const skew = angles.length >= 3 ? median(angles) : 0
  let deskew = 0
  if (Math.abs(skew) > 1.5 && Math.abs(skew) < 30) {
    deskew = skew
    raw = await toRaw(
      sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } }).rotate(skew, {
        background: '#ffffff',
      }),
    )
    boxes = await detect(engine, raw)
    passes += 1
  }
  let lines = await recognize(engine, raw, boxes)
  const meanConf =
    lines.length === 0 ? 0 : lines.reduce((s, l) => s + l.confidence, 0) / lines.length
  if (meanConf < 0.75) {
    const flipped = await toRaw(
      sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } }).rotate(180),
    )
    const flippedBoxes = await detect(engine, flipped)
    const flippedLines = await recognize(engine, flipped, flippedBoxes)
    passes += 1
    const flippedConf =
      flippedLines.length === 0
        ? 0
        : flippedLines.reduce((s, l) => s + l.confidence, 0) / flippedLines.length
    if (flippedConf > meanConf) {
      lines = flippedLines
      rotation += 180
    }
  }
  return { lines, rotation, deskew, passes }
}
