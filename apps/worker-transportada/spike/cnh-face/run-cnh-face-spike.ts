/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spike 295 T4.1: roda o extrator sobre uma pasta de amostras e imprime só desfecho e medidas, nunca
 * conteúdo. Uso: `bun run-cnh-face-spike.ts <modelo.onnx> <pasta-de-amostras> [pasta-de-saída]`.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCnhFaceExtractor } from './cnh-face-extractor.js'

const [modelPath, samplesDirectory, outputDirectory] = process.argv.slice(2)
if (!modelPath || !samplesDirectory)
  throw new Error('uso: <modelo.onnx> <pasta-de-amostras> [pasta-de-saída]')

const extractor = await createCnhFaceExtractor({ modelPath })
const files = (await readdir(samplesDirectory)).filter((name) => name.startsWith('sample-')).sort()
if (outputDirectory) await mkdir(outputDirectory, { recursive: true })

for (const [index, name] of files.entries()) {
  const startedAt = performance.now()
  const result = await extractor.extract(
    new Uint8Array(await readFile(join(samplesDirectory, name))),
  )
  const elapsedMilliseconds = Math.round(performance.now() - startedAt)
  const { webp, ...measures } = result
  console.log(
    JSON.stringify({
      sample: index,
      ...measures,
      webpBytes: webp?.byteLength,
      elapsedMilliseconds,
    }),
  )
  if (webp && outputDirectory) await writeFile(join(outputDirectory, `face-${index}.webp`), webp)
}
