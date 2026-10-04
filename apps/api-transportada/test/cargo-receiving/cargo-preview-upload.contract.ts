/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0094 §7): o envio decide o tipo pelos bytes, guarda o objeto com chave opaca e
 * só então grava prévia + pedido ao worker; objeto que não virou prévia sai do bucket.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CargoPreviewObjectStoragePort,
  CargoPreviewUploadRepositoryPort,
} from '../../src/cargo-receiving/application/cargo-preview.port.js'
import type {
  CargoPreviewUploadGate,
  CreateCargoPreviewRecord,
  CreateCargoPreviewResult,
} from '../../src/cargo-receiving/application/cargo-preview-request.types.js'
import { createUploadCargoPreviewUseCase } from '../../src/cargo-receiving/application/upload-cargo-preview.use-case.js'
import {
  buildCargoPreviewMatchLockKey,
  buildCargoPreviewObjectKey,
  CARGO_PREVIEW_UPLOAD_MAX_BYTES,
  sanitizePreviewFileName,
} from '../../src/cargo-receiving/domain/cargo-preview-upload.policy.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000d01'
const PREVIEW_ID = '00000000-0000-4000-8000-000000000d02'
const KEY = 'preview-key-0000000001'
const WORKBOOK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9])
const NOW = new Date('2026-10-04T12:00:00.000Z')

type Fake = {
  readonly creates: CreateCargoPreviewRecord[]
  readonly deletes: { bucket: string; key: string }[]
  readonly stores: { bucket: string; key: string; sha256: string }[]
}

function createUseCase(input: {
  readonly create?: () => Promise<CreateCargoPreviewResult>
  readonly gate?: CargoPreviewUploadGate
}) {
  const fake: Fake = { creates: [], deletes: [], stores: [] }
  const uploadRepository: CargoPreviewUploadRepositoryPort = {
    checkGate: async () => input.gate ?? { kind: 'open' },
    async create(record) {
      fake.creates.push(record)
      return input.create === undefined
        ? { kind: 'created', previewId: PREVIEW_ID }
        : input.create()
    },
    reopen: async () => {
      throw new Error('Only a failed or lost preview reopens')
    },
  }
  const storage: CargoPreviewObjectStoragePort = {
    async deleteObject(location) {
      fake.deletes.push({ ...location })
    },
    async storeObject(object) {
      fake.stores.push({ bucket: object.bucket, key: object.key, sha256: object.sha256 })
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
    storage,
    uploadRepository,
  })
  const upload = (bytes: Uint8Array = WORKBOOK) =>
    useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: 'correlation-1',
      idempotencyKey: KEY,
      input: { bytes, contractorId: CONTRACTOR_ID, fileName: 'FR-28-09.xlsm' },
    })
  return { fake, upload }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown'
  }
}

describe('o envio da prévia (spec 237 T4.2)', () => {
  test('grava o objeto com chave opaca e a prévia com o sha256 e a hora do servidor', async () => {
    const { fake, upload } = createUseCase({})
    const result = await upload()

    expect(result).toEqual({ isReplay: false, preview: { id: PREVIEW_ID } as never })
    const [record] = fake.creates
    expect(record?.objectKey).toBe(
      buildCargoPreviewObjectKey({
        companyId: COMPANY_CONTEXT.companyId,
        fileObjectId: record?.fileObjectId ?? '',
      }),
    )
    expect(record?.objectKey).not.toContain('FR-28-09')
    expect(record?.fileSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(record?.receivedAt).toEqual(NOW)
    expect(fake.stores).toEqual([
      { bucket: 'private-bucket', key: record?.objectKey ?? '', sha256: record?.fileSha256 ?? '' },
    ])
    expect(fake.deletes).toEqual([])
  })

  test('o tipo é decidido pelos bytes: sem PK\\x03\\x04 é 422, antes de tocar no bucket', async () => {
    const { fake, upload } = createUseCase({})
    const notAZip = new TextEncoder().encode('RouteName;VALOR\nFR.S.CAR;10,00')

    expect(await codeOf(upload(notAZip))).toBe('PREVIEW_NOT_A_WORKBOOK')
    expect(fake.stores).toEqual([])
    expect(fake.creates).toEqual([])
  })

  test('acima do teto é 413 PREVIEW_FILE_TOO_LARGE', async () => {
    const { fake, upload } = createUseCase({})
    const big = new Uint8Array(CARGO_PREVIEW_UPLOAD_MAX_BYTES + 1)
    big.set(WORKBOOK)

    expect(await codeOf(upload(big))).toBe('PREVIEW_FILE_TOO_LARGE')
    expect(fake.stores).toEqual([])
  })

  test.each([
    ['contractor_not_found', 'CONTRACTOR_NOT_FOUND'],
    ['not_enabled', 'CARGO_PREVIEW_NOT_ENABLED'],
    ['key_reused', 'CARGO_PREVIEW_KEY_REUSED'],
  ] as const)('portão %s recusa com %s sem gravar nada', async (kind, code) => {
    const { fake, upload } = createUseCase({ gate: { kind } })
    expect(await codeOf(upload())).toBe(code)
    expect(fake.stores).toEqual([])
    expect(fake.creates).toEqual([])
  })

  test('o mesmo arquivo de novo devolve a prévia existente sem subir outro objeto', async () => {
    const { fake, upload } = createUseCase({
      gate: {
        fileObjectId: PREVIEW_ID,
        kind: 'replayed',
        previewId: PREVIEW_ID,
        status: 'queued',
        updatedAt: NOW,
      },
    })
    expect(await upload()).toEqual({ isReplay: true, preview: { id: PREVIEW_ID } as never })
    expect(fake.stores).toEqual([])
  })

  test('corrida perdida (outro envio gravou antes) apaga o objeto novo e devolve a existente', async () => {
    const { fake, upload } = createUseCase({
      create: async () => ({ kind: 'replayed', previewId: PREVIEW_ID }),
    })
    expect((await upload()).isReplay).toBeTrue()
    expect(fake.deletes).toEqual([{ bucket: 'private-bucket', key: fake.stores[0]?.key ?? '' }])
  })

  test('transação que falha apaga o objeto e propaga o erro', async () => {
    const { fake, upload } = createUseCase({
      create: async () => {
        throw new Error('database down')
      },
    })
    expect(await codeOf(upload())).toBe('unknown')
    expect(fake.deletes).toHaveLength(1)
  })
})

describe('o nome do arquivo e as chaves (spec 237 T4.2)', () => {
  test.each([
    ['C:\\Users\\op\\FR-28-09.xlsm', 'FR-28-09.xlsm'],
    ['../../etc/passwd', 'passwd'],
    ['  FR\u0000-01-10.xlsm  ', 'FR-01-10.xlsm'],
    ['/', 'preview'],
    [`${'a'.repeat(200)}.xlsm`, 'a'.repeat(180)],
  ])('%j vira %j', (raw, expected) => {
    expect(sanitizePreviewFileName(raw)).toBe(expected)
  })

  test('a trava do vínculo é por empresa e contratante', () => {
    expect(buildCargoPreviewMatchLockKey({ companyId: 'c1', contractorId: 'k1' })).toBe(
      'cargo-preview-match:c1:k1',
    )
  })
})
