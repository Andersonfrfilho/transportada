/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// B: vetor de 1280 posições da MobileNetV3-Large (penúltima camada) por visão da imagem, via onnxruntime-web.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import * as ort from 'onnxruntime-web'
import sharp from 'sharp'

const [root, outFile] = process.argv.slice(2) as [string, string]
ort.env.wasm.numThreads = 1
const session = await ort.InferenceSession.create(
  new Uint8Array(readFileSync(`${root}/models/mnv3-features.onnx`)),
  { executionProviders: ['wasm'] },
)
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

async function embed(image: sharp.Sharp): Promise<number[]> {
  const pixels = await image
    .resize(224, 224, { fit: 'contain', background: '#808080' })
    .removeAlpha()
    .raw()
    .toBuffer()
  const input = new Float32Array(3 * 224 * 224)
  for (let i = 0; i < 224 * 224; i += 1)
    for (let c = 0; c < 3; c += 1)
      input[c * 224 * 224 + i] = ((pixels[i * 3 + c] ?? 0) / 255 - (MEAN[c] ?? 0)) / (STD[c] ?? 1)
  const output = await session.run({
    [session.inputNames[0] as string]: new ort.Tensor('float32', input, [1, 3, 224, 224]),
  })
  return Array.from(
    output[session.outputNames[0] as string]?.data as Float32Array,
    (v) => Math.round(v * 1e4) / 1e4,
  )
}

const result: Record<string, { views: number[][]; ms: number }> = {}
for (const file of readdirSync(`${root}/img`).sort()) {
  const base = await sharp(readFileSync(`${root}/img/${file}`))
    .rotate()
    .resize(640, 640, { fit: 'inside' })
    .toBuffer()
  const meta = await sharp(base).metadata()
  const views: number[][] = []
  const started = performance.now()
  for (const angle of [0, 90, 180, 270]) views.push(await embed(sharp(base).rotate(angle)))
  const ms = (performance.now() - started) / 4
  const w = meta.width ?? 1,
    h = meta.height ?? 1
  const crop = {
    left: Math.round(w * 0.1),
    top: Math.round(h * 0.1),
    width: Math.round(w * 0.8),
    height: Math.round(h * 0.8),
  }
  const cropped = await sharp(base).extract(crop).toBuffer()
  for (const angle of [0, 90, 180, 270]) views.push(await embed(sharp(cropped).rotate(angle)))
  result[file.slice(0, 4)] = { views, ms }
}
writeFileSync(outFile, JSON.stringify(result))
console.log(
  JSON.stringify({
    images: Object.keys(result).length,
    maxRssMb: Math.round(process.memoryUsage().rss / 1048576),
  }),
)
