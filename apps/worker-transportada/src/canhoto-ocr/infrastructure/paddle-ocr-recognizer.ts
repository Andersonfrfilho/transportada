/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import sharp from 'sharp'
import type { Tensor } from 'onnxruntime-web'

import type { OcrEngine, OcrLine, RawImage, TextBox } from './paddle-ocr.types.js'

const RECOGNITION_HEIGHT = 48
const MAX_BOXES = 160
const MAX_RECOGNITION_WIDTH = 960
const BLANK_CLASS = 0

const area = (box: TextBox): number => (box.x1 - box.x0) * (box.y1 - box.y0)

function decodeCtc(engine: OcrEngine, output: Tensor): { confidence: number; text: string } {
  const [, steps, classes] = output.dims as [number, number, number]
  const probabilities = output.data as Float32Array
  let text = ''
  let confidenceSum = 0
  let confidenceCount = 0
  let last = -1
  for (let step = 0; step < steps; step += 1) {
    let best = 0
    let bestProbability = -1
    for (let klass = 0; klass < classes; klass += 1) {
      const probability = probabilities[step * classes + klass] ?? 0
      if (probability > bestProbability) {
        bestProbability = probability
        best = klass
      }
    }
    if (best !== BLANK_CLASS && best !== last) {
      text += engine.dictionary[best] ?? ''
      confidenceSum += bestProbability
      confidenceCount += 1
    }
    last = best
  }
  return { confidence: confidenceCount === 0 ? 0 : confidenceSum / confidenceCount, text }
}

export async function recognizeLines(
  engine: OcrEngine,
  image: RawImage,
  boxes: readonly TextBox[],
): Promise<OcrLine[]> {
  const base = sharp(image.data, { raw: { channels: 3, height: image.height, width: image.width } })
  const lines: OcrLine[] = []
  const largest = [...boxes].sort((left, right) => area(right) - area(left)).slice(0, MAX_BOXES)
  for (const box of largest) {
    const width = box.x1 - box.x0 + 1
    const height = box.y1 - box.y0 + 1
    const targetWidth = Math.min(
      MAX_RECOGNITION_WIDTH,
      Math.max(16, Math.ceil((RECOGNITION_HEIGHT * width) / height / 8) * 8),
    )
    const crop = await base
      .clone()
      .extract({ height, left: box.x0, top: box.y0, width })
      .resize(targetWidth, RECOGNITION_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer()
    const input = new Float32Array(3 * RECOGNITION_HEIGHT * targetWidth)
    for (let pixel = 0; pixel < RECOGNITION_HEIGHT * targetWidth; pixel += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        input[channel * RECOGNITION_HEIGHT * targetWidth + pixel] =
          ((crop[pixel * 3 + (2 - channel)] ?? 0) / 255 - 0.5) / 0.5
      }
    }
    const feeds = {
      [engine.recognizer.inputNames[0] as string]: engine.tensor(input, [
        1,
        3,
        RECOGNITION_HEIGHT,
        targetWidth,
      ]),
    }
    const output = (await engine.recognizer.run(feeds))[engine.recognizer.outputNames[0] as string]
    if (output === undefined) continue
    const decoded = decodeCtc(engine, output)
    if (decoded.text.trim().length > 0) lines.push({ box, ...decoded })
  }
  return lines.sort((left, right) => left.box.y0 - right.box.y0 || left.box.x0 - right.box.x0)
}
