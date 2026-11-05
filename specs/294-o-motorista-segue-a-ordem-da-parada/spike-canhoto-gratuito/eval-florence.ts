/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// C: Florence-2-base-ft (MIT) via transformers.js, tarefa <OCR>. Grava só contagens e acertos, nunca o texto.
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

import {
  AutoProcessor,
  env,
  Florence2ForConditionalGeneration,
  RawImage,
} from '@huggingface/transformers'
import sharp from 'sharp'

import { digitRuns, extractNfNumber, foundMarkers, matchCandidates } from './canhoto-match.ts'

type Meta = { review: string; truth: string; trip: string[]; stop: string[] }
const [root, outFile, limitText] = process.argv.slice(2) as [string, string, string | undefined]
env.cacheDir = `${root}/models/hf-cache`
const MODEL = 'onnx-community/Florence-2-base-ft'
const loadStart = performance.now()
const model = await Florence2ForConditionalGeneration.from_pretrained(MODEL, {
  dtype: (process.env.DTYPE ?? 'q8') as 'q8',
})
const processor = await AutoProcessor.from_pretrained(MODEL)
console.log(JSON.stringify({ event: 'ready', loadMs: Math.round(performance.now() - loadStart) }))
const meta = JSON.parse(readFileSync(`${root}/meta/prod.json`, 'utf8')) as Record<string, Meta>
const positives = Object.values(meta).filter((m) => m.review === 'approved')
const files = readdirSync(`${root}/img`)
  .sort()
  .filter(
    (_, i, all) => limitText === undefined || i % Math.ceil(all.length / Number(limitText)) === 0,
  )
writeFileSync(outFile, '')
let maxRss = 0

async function ocr(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const image = new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3)
  const prompts = processor.construct_prompts('<OCR>')
  const inputs = await processor(image, prompts)
  const ids = await model.generate({ ...inputs, max_new_tokens: 256 })
  const text = processor.batch_decode(ids as never, { skip_special_tokens: false })[0] as string
  const parsed = processor.post_process_generation(text, '<OCR>', image.size) as Record<
    string,
    string
  >
  return parsed['<OCR>'] ?? ''
}

for (const [order, file] of files.entries()) {
  const prefix = file[0] as string
  const index = Number(file.slice(1, 4))
  const m = prefix === 'p' ? meta[String(index)] : undefined
  const label = prefix === 'p' ? (m?.review === 'approved' ? 1 : -1) : 0
  const context = m ?? positives[order % positives.length]
  const started = performance.now()
  const oriented = await sharp(readFileSync(`${root}/img/${file}`))
    .rotate()
    .toBuffer()
  const info = await sharp(oriented).metadata()
  const angles = (info.height ?? 0) > (info.width ?? 0) ? [270, 90] : [0, 180]
  let best = { text: '', score: -1 }
  for (const angle of angles) {
    const text = await ocr(await sharp(oriented).rotate(angle).toBuffer())
    const score = foundMarkers(text).length * 10 + digitRuns(text).size
    if (score > best.score) best = { text, score }
  }
  const ms = performance.now() - started
  maxRss = Math.max(maxRss, process.memoryUsage().rss)
  const markers = foundMarkers(best.text)
  const runs = digitRuns(best.text)
  const extracted = extractNfNumber([best.text])
  const truth = context?.truth.replace(/^0+/u, '') ?? ''
  const trip = matchCandidates(runs, context?.trip ?? [])
  const stop = matchCandidates(runs, context?.stop ?? [])
  appendFileSync(
    outFile,
    `${JSON.stringify({
      id: `${prefix}${index}`,
      label,
      markers: markers.length,
      extractedOk: extracted === truth,
      extractedAny: extracted !== undefined,
      tripKind: trip.kind,
      tripOk: trip.match === truth,
      stopKind: stop.kind,
      stopOk: stop.match === truth,
      truthSeen: runs.has(truth),
      ms: Math.round(ms),
    })}\n`,
  )
}
console.log(
  JSON.stringify({ event: 'done', files: files.length, maxRssMb: Math.round(maxRss / 1048576) }),
)
