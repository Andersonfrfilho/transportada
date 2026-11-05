/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: a thread real, com o modelo real, sobre imagens sintéticas (nenhum documento de
 * pessoa entra no repositório). Rosto positivo foi medido no spike com CNH real; aqui o que se prova é
 * que pdf.js, sharp e o WASM carregam na thread e que o que não é rosto não vira foto.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'

import {
  createThreadedCnhFaceGateway,
  resolveCnhFacePaths,
} from '../../src/cnh-face/infrastructure/threaded-cnh-face.gateway.js'

const THREAD_TIMEOUT_MS = 60_000

describe('a thread do rosto da CNH', () => {
  test(
    'imagem sem rosto: no_face, sem imagem de saída',
    async () => {
      const blank = await sharp({
        create: { background: '#888888', channels: 3, height: 600, width: 800 },
      })
        .jpeg()
        .toBuffer()

      const result = await createThreadedCnhFaceGateway().extract(new Uint8Array(blank))

      expect(result.outcome).toBe('no_face')
      expect(result.sourceKind).toBe('image')
      expect(result.webp).toBeUndefined()
    },
    THREAD_TIMEOUT_MS,
  )

  test(
    'arquivo que não é imagem nem PDF: unsupported',
    async () => {
      const result = await createThreadedCnhFaceGateway().extract(
        new TextEncoder().encode('isto não é um documento'),
      )

      expect(result.outcome).toBe('unsupported')
      expect(result.candidateImages).toBe(0)
    },
    THREAD_TIMEOUT_MS,
  )

  test(
    'modelo ausente: a promessa rejeita (a foto falha, a leitura da CNH não)',
    async () => {
      const gateway = createThreadedCnhFaceGateway({ modelPath: '/nao/existe.onnx' })

      await expect(gateway.extract(new Uint8Array([1, 2, 3]))).rejects.toThrow()
    },
    THREAD_TIMEOUT_MS,
  )
})

describe('os caminhos da thread e do modelo', () => {
  /** `bun build --root ./src` grava o backfill em `dist/cnh-face/` com o gateway embutido: o `import.meta.url` é o do bundle. */
  test('resolvem do mesmo ponto de apoio em src/*.ts, dist/main.js e dist/cnh-face/*.main.js', () => {
    const root = mkdtempSync(join(tmpdir(), 'cnh-face-layout-'))
    try {
      const model = join(root, 'assets', 'ultraface-rfb-320.onnx')
      const entrypoints = [
        join(root, 'src', 'cnh-face', 'infrastructure', 'threaded-cnh-face.gateway.ts'),
        join(root, 'dist', 'main.js'),
        join(root, 'dist', 'cnh-face', 'cnh-picture-backfill.main.js'),
      ]
      mkdirSync(join(root, 'assets'), { recursive: true })
      writeFileSync(model, 'x')
      for (const entrypoint of entrypoints) {
        mkdirSync(join(entrypoint, '..'), { recursive: true })
        writeFileSync(entrypoint, '')
      }

      const [fromSource, fromMain, fromBackfill] = entrypoints.map((entrypoint) =>
        resolveCnhFacePaths(pathToFileURL(entrypoint).href),
      )

      for (const paths of [fromSource, fromMain, fromBackfill]) {
        expect(paths?.modelPath).toBe(model)
      }
      expect(fromSource?.workerPath).toBe(
        join(root, 'src', 'cnh-face', 'infrastructure', 'cnh-face.worker.ts'),
      )
      for (const paths of [fromMain, fromBackfill]) {
        expect(paths?.workerPath).toBe(
          join(root, 'dist', 'cnh-face', 'infrastructure', 'cnh-face.worker.js'),
        )
      }
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  test('sem assets/ acima do módulo, falha alto em vez de devolver caminho inexistente', () => {
    const root = mkdtempSync(join(tmpdir(), 'cnh-face-nolayout-'))
    try {
      expect(() => resolveCnhFacePaths(pathToFileURL(join(root, 'dist', 'main.js')).href)).toThrow()
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
