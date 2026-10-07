/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (correção da revisão da Fase 4a, M1): reenviar o mesmo arquivo de uma prévia que
 * falhou — ou que ficou `processing` além do prazo da leitura — reabre a MESMA prévia na fila. A
 * prévia pronta, ou em leitura recente, continua sendo repetição: 200 e nada reprocessa.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoPreviewUploadRepositoryPort } from '../../src/cargo-receiving/application/cargo-preview.port.js'
import type { ReopenCargoPreviewRecord } from '../../src/cargo-receiving/application/cargo-preview-request.types.js'
import { createUploadCargoPreviewUseCase } from '../../src/cargo-receiving/application/upload-cargo-preview.use-case.js'
import {
  buildCargoPreviewObjectKey,
  canReopenCargoPreview,
  CARGO_PREVIEW_PROCESSING_LEASE_MS,
} from '../../src/cargo-receiving/domain/cargo-preview-upload.policy.js'
import type { CargoPreviewStatus } from '../../src/shared/cargo-preview.constant.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000e01'
const PREVIEW_ID = '00000000-0000-4000-8000-000000000e02'
const FILE_OBJECT_ID = '00000000-0000-4000-8000-000000000e03'
const WORKBOOK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9])
const NOW = new Date('2026-10-04T12:00:00.000Z')
const MINUTE_MS = 60_000

function resend(input: { readonly status: CargoPreviewStatus; readonly updatedAt: Date }) {
  const reopens: ReopenCargoPreviewRecord[] = []
  const stores: string[] = []
  const deletes: string[] = []
  const uploadRepository: CargoPreviewUploadRepositoryPort = {
    checkGate: async () => ({
      fileObjectId: FILE_OBJECT_ID,
      kind: 'replayed',
      previewId: PREVIEW_ID,
      status: input.status,
      updatedAt: input.updatedAt,
    }),
    create: async () => {
      throw new Error('A resent file never creates a second preview')
    },
    async reopen(record) {
      reopens.push(record)
      return true
    },
  }
  const useCase = createUploadCargoPreviewUseCase({
    bucket: 'private-bucket',
    now: () => NOW,
    readRepository: {
      findDetail: async () => null,
      findSummary: async ({ previewId }) => ({ id: previewId }) as never,
      list: async () => ({ items: [], nextCursor: null }),
    },
    storage: {
      deleteObject: async ({ key }) => void deletes.push(key),
      storeObject: async ({ key }) => void stores.push(key),
    },
    uploadRepository,
  })
  const run = () =>
    useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: 'correlation-2',
      idempotencyKey: 'preview-key-0000000002',
      input: { bytes: WORKBOOK, contractorId: CONTRACTOR_ID, fileName: 'FR-28-09.xlsm' },
    })
  return { deletes, reopens, run, stores }
}

describe('reenviar a prévia que não terminou (spec 237 M1)', () => {
  test('o prazo da leitura é de 15 minutos', () => {
    expect(CARGO_PREVIEW_PROCESSING_LEASE_MS).toBe(15 * MINUTE_MS)
  })

  test.each([
    ['failed', 0, true],
    ['processing', 16, true],
    ['processing', 14, false],
    ['queued', 60, false],
    ['ready', 60, false],
  ] as const)('%s há %p min: reabre = %p', (status, ageMinutes, expected) => {
    const updatedAt = new Date(NOW.getTime() - ageMinutes * MINUTE_MS)
    expect(canReopenCargoPreview({ now: NOW, status, updatedAt })).toBe(expected)
  })

  test('falhou: reabre a mesma prévia, com os bytes de novo na chave dela', async () => {
    const { deletes, reopens, run, stores } = resend({ status: 'failed', updatedAt: NOW })
    expect(await run()).toEqual({ isReplay: false, preview: { id: PREVIEW_ID } as never })
    const objectKey = buildCargoPreviewObjectKey({
      companyId: COMPANY_CONTEXT.companyId,
      fileObjectId: FILE_OBJECT_ID,
    })
    expect(stores).toEqual([objectKey])
    expect(reopens).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        bucket: 'private-bucket',
        companyId: COMPANY_CONTEXT.companyId,
        contractorId: CONTRACTOR_ID,
        correlationId: 'correlation-2',
        fileSizeBytes: WORKBOOK.byteLength,
        now: NOW,
        objectKey,
        previewId: PREVIEW_ID,
      },
    ])
    expect(deletes).toEqual([])
  })

  test.each([
    ['ready', 0],
    ['processing', 1],
    ['queued', 60],
  ] as const)(
    '%s (há %p min) é repetição: 200, sem reabrir nem subir objeto',
    async (status, age) => {
      const updatedAt = new Date(NOW.getTime() - age * MINUTE_MS)
      const { reopens, run, stores } = resend({ status, updatedAt })
      expect((await run()).isReplay).toBeTrue()
      expect(reopens).toEqual([])
      expect(stores).toEqual([])
    },
  )
})
