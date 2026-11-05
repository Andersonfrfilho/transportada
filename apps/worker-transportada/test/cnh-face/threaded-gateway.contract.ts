/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: a thread real, com o modelo real, sobre imagens sintéticas (nenhum documento de
 * pessoa entra no repositório). Rosto positivo foi medido no spike com CNH real; aqui o que se prova é
 * que pdf.js, sharp e o WASM carregam na thread e que o que não é rosto não vira foto.
 */
import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'

import { createThreadedCnhFaceGateway } from '../../src/cnh-face/infrastructure/threaded-cnh-face.gateway.js'

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
