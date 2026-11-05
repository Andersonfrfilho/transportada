/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Detecção de texto do PP-OCRv4 sem OpenCV: o mapa de probabilidade vira caixas por componentes conexos
 * (retângulo alargado), o que basta para a faixa do canhoto (spike 294 T4.8b).
 */
import sharp from 'sharp'

import type { OcrEngine, RawImage, TextBox } from './paddle-ocr.types.js'

const DETECTION_LIMIT = 960
const DETECTION_THRESHOLD = 0.3
const BOX_THRESHOLD = 0.5
const UNCLIP_RATIO = 1.6
const MIN_PIXELS = 12
const MIN_SIDE = 3
const MEAN = [0.485, 0.456, 0.406] as const
const STANDARD_DEVIATION = [0.229, 0.224, 0.225] as const

async function toDetectionInput(image: RawImage): Promise<{
  readonly height: number
  readonly input: Float32Array
  readonly width: number
}> {
  const scale = Math.min(1, DETECTION_LIMIT / Math.max(image.width, image.height))
  const width = Math.max(32, Math.round((image.width * scale) / 32) * 32)
  const height = Math.max(32, Math.round((image.height * scale) / 32) * 32)
  const resized = await sharp(image.data, {
    raw: { channels: 3, height: image.height, width: image.width },
  })
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer()
  const input = new Float32Array(3 * width * height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      // O PaddleOCR lê em BGR.
      const value = (resized[pixel * 3 + (2 - channel)] ?? 0) / 255
      input[channel * width * height + pixel] =
        (value - (MEAN[channel] ?? 0)) / (STANDARD_DEVIATION[channel] ?? 1)
    }
  }
  return { height, input, width }
}

type Component = {
  count: number
  sum: number
  sumX: number
  sumXX: number
  sumXY: number
  sumY: number
  sumYY: number
  x0: number
  x1: number
  y0: number
  y1: number
}

function floodComponent(params: {
  readonly height: number
  readonly map: Float32Array
  readonly seen: Uint8Array
  readonly start: number
  readonly width: number
}): Component {
  const { height, map, seen, start, width } = params
  const component: Component = {
    count: 0,
    sum: 0,
    sumX: 0,
    sumXX: 0,
    sumXY: 0,
    sumY: 0,
    sumYY: 0,
    x0: width,
    x1: 0,
    y0: height,
    y1: 0,
  }
  const stack = [start]
  seen[start] = 1
  while (stack.length > 0) {
    const pixel = stack.pop() as number
    const x = pixel % width
    const y = (pixel - x) / width
    component.count += 1
    component.sum += map[pixel] ?? 0
    component.sumX += x
    component.sumY += y
    component.sumXX += x * x
    component.sumYY += y * y
    component.sumXY += x * y
    component.x0 = Math.min(component.x0, x)
    component.x1 = Math.max(component.x1, x)
    component.y0 = Math.min(component.y0, y)
    component.y1 = Math.max(component.y1, y)
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      pixel - width,
      pixel + width,
    ]
    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= width * height || seen[neighbor] === 1) continue
      if ((map[neighbor] ?? 0) <= DETECTION_THRESHOLD) continue
      seen[neighbor] = 1
      stack.push(neighbor)
    }
  }
  return component
}

function toBox(
  component: Component,
  scale: { readonly x: number; readonly y: number },
  limit: RawImage,
) {
  const width = component.x1 - component.x0 + 1
  const height = component.y1 - component.y0 + 1
  const meanX = component.sumX / component.count
  const meanY = component.sumY / component.count
  const varianceX = component.sumXX / component.count - meanX * meanX
  const varianceY = component.sumYY / component.count - meanY * meanY
  const covariance = component.sumXY / component.count - meanX * meanY
  const offset = (width * height * UNCLIP_RATIO) / (2 * (width + height))
  return {
    angle: (0.5 * Math.atan2(2 * covariance, varianceX - varianceY) * 180) / Math.PI,
    score: component.sum / component.count,
    x0: Math.max(0, Math.floor((component.x0 - offset) * scale.x)),
    x1: Math.min(limit.width - 1, Math.ceil((component.x1 + offset) * scale.x)),
    y0: Math.max(0, Math.floor((component.y0 - offset) * scale.y)),
    y1: Math.min(limit.height - 1, Math.ceil((component.y1 + offset) * scale.y)),
  } satisfies TextBox
}

export async function detectTextBoxes(engine: OcrEngine, image: RawImage): Promise<TextBox[]> {
  const { height, input, width } = await toDetectionInput(image)
  const feeds = {
    [engine.detector.inputNames[0] as string]: engine.tensor(input, [1, 3, height, width]),
  }
  const output = await engine.detector.run(feeds)
  const map = output[engine.detector.outputNames[0] as string]?.data as Float32Array
  const seen = new Uint8Array(width * height)
  const scale = { x: image.width / width, y: image.height / height }
  const boxes: TextBox[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] === 1 || (map[start] ?? 0) <= DETECTION_THRESHOLD) continue
    const component = floodComponent({ height, map, seen, start, width })
    const isNoise =
      component.count < MIN_PIXELS ||
      component.sum / component.count < BOX_THRESHOLD ||
      Math.min(component.x1 - component.x0 + 1, component.y1 - component.y0 + 1) < MIN_SIDE
    if (!isNoise) boxes.push(toBox(component, scale, image))
  }
  return boxes
}
