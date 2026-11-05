/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// Avalia um leitor de OCR (A: PaddleOCR) na amostra. Grava por imagem só índice, rótulo, contagens e acertos (sem texto).
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

import * as ort from 'onnxruntime-web'

import { digitRuns, extractNfNumber, foundMarkers, matchCandidates } from './canhoto-match.ts'
import { loadEngine, readImage } from './paddle-ocr.ts'

type Meta = { review: string; truth: string; trip: string[]; stop: string[] }

const [root, outFile] = process.argv.slice(2) as [string, string]
const meta = JSON.parse(readFileSync(`${root}/meta/prod.json`, 'utf8')) as Record<string, Meta>
const positives = Object.values(meta).filter((m) => m.review === 'approved')
ort.env.wasm.numThreads = Number(process.env.THREADS ?? 1)
const loadStart = performance.now()
const engine = await loadEngine(ort, `${root}/models`)
console.log(JSON.stringify({ event: 'ready', loadMs: Math.round(performance.now() - loadStart) }))
writeFileSync(outFile, '')
const files = readdirSync(`${root}/img`).sort()
let maxRss = 0
for (const [order, file] of files.entries()) {
  const prefix = file[0] as string
  const index = Number(file.slice(1, 4))
  const m = prefix === 'p' ? meta[String(index)] : undefined
  const label = prefix === 'p' ? (m?.review === 'approved' ? 1 : -1) : 0
  // negativos recebem o conjunto de candidatas de um positivo, para medir casamento por acaso
  const context = m ?? positives[order % positives.length]
  const started = performance.now()
  const result = await readImage(engine, readFileSync(`${root}/img/${file}`))
  const ms = performance.now() - started
  maxRss = Math.max(maxRss, process.memoryUsage().rss)
  const texts = result.lines.map((l) => l.text)
  const fullText = texts.join('\n')
  const markers = foundMarkers(fullText)
  const runs = digitRuns(fullText)
  const extracted = extractNfNumber(texts)
  const truth = context?.truth.replace(/^0+/u, '') ?? ''
  const trip = matchCandidates(runs, context?.trip ?? [])
  const stop = matchCandidates(runs, context?.stop ?? [])
  appendFileSync(
    outFile,
    `${JSON.stringify({
      id: `${prefix}${index}`,
      label,
      markers: markers.length,
      markerNames: markers,
      lines: texts.length,
      extractedOk: extracted !== undefined && extracted === truth,
      extractedAny: extracted !== undefined,
      tripKind: trip.kind,
      tripOk: trip.match === truth,
      tripSize: context?.trip.length ?? 0,
      stopKind: stop.kind,
      stopOk: stop.match === truth,
      truthSeen: runs.has(truth),
      ms: Math.round(ms),
      passes: result.passes,
      rotation: result.rotation,
    })}\n`,
  )
}
console.log(
  JSON.stringify({ event: 'done', files: files.length, maxRssMb: Math.round(maxRss / 1048576) }),
)
