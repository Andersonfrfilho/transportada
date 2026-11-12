/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: o modelo é arquivo do disco, lido pela thread. Ficar fora da imagem é falha
 * silenciosa em produção (a foto simplesmente nunca nasce), então o contrato cobra os três elos.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { CNH_FACE_MODEL_SHA256 } from '../../src/cnh-face/domain/cnh-face.constant.js'
import { resolveCnhFaceModelPath } from '../../src/cnh-face/infrastructure/threaded-cnh-face.gateway.js'

const APP_ROOT = new URL('../../', import.meta.url)

describe('o modelo do detector de rosto da CNH', () => {
  test('o arquivo existe onde a thread o procura e tem o sha256 declarado', async () => {
    const bytes = new Uint8Array(await Bun.file(resolveCnhFaceModelPath()).arrayBuffer())

    expect(createHash('sha256').update(bytes).digest('hex')).toBe(CNH_FACE_MODEL_SHA256)
  })

  test('a imagem do worker copia assets/ ao lado de dist/, que é onde o código empacotado o procura', async () => {
    const dockerfile = await Bun.file(new URL('Dockerfile', APP_ROOT)).text()

    expect(dockerfile).toContain(
      'COPY apps/worker-transportada/assets apps/worker-transportada/assets',
    )
    expect(dockerfile).toContain('apps/worker-transportada/dist')
  })

  test('o build empacota a thread e o onnxruntime-web é dependência de produção do worker', async () => {
    const manifest = (await Bun.file(new URL('package.json', APP_ROOT)).json()) as {
      readonly dependencies: Readonly<Record<string, string>>
      readonly scripts: Readonly<Record<string, string>>
    }

    expect(manifest.scripts.build).toContain('./src/cnh-face/infrastructure/cnh-face.worker.ts')
    expect(manifest.dependencies['onnxruntime-web']).toBe('1.23.2')
  })
})
