/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: o backfill do rosto da CNH. `--dry-run` é o padrão e só conta; nada é lido,
 * detectado nem enviado até `--confirm`.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  runCnhPictureBackfill,
  type CnhPictureBackfillCandidate,
} from '../../src/cnh-face/application/cnh-picture-backfill.service.js'
import { resolveBackfillMode } from '../../src/cnh-face/cnh-picture-backfill.main.js'
import { CNH_PICTURE_API_PATH_TEMPLATE } from '../../src/cnh-face/infrastructure/cnh-picture-api.gateway.js'
import type { CnhFaceResult } from '../../src/cnh-face/domain/cnh-face.types.js'

const API_SOURCE = new URL('../../../api-transportada/src/', import.meta.url)

function buildCandidates(count: number): readonly CnhPictureBackfillCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    attachmentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    bucket: 'bucket',
    companyId: crypto.randomUUID(),
    objectKey: `object-${index}`,
  }))
}

const GOOD_FACE: CnhFaceResult = {
  candidateImages: 1,
  cropShortSide: 200,
  faceScore: 0.999,
  facesFound: 1,
  outcome: 'extracted',
  sourceKind: 'pdf_digital',
  webp: new Uint8Array([1]),
}

function buildHarness(candidates: readonly CnhPictureBackfillCandidate[]) {
  const calls = { applied: 0, extracted: 0, listed: [] as (string | undefined)[], read: 0 }
  const source = {
    async listPending({ afterAttachmentId, limit }: { afterAttachmentId?: string; limit: number }) {
      calls.listed.push(afterAttachmentId)
      const start =
        afterAttachmentId === undefined
          ? 0
          : candidates.findIndex((entry) => entry.attachmentId === afterAttachmentId) + 1
      return candidates.slice(start, start + limit)
    },
  }
  const reader = {
    async read({ key }: { key: string }) {
      calls.read += 1
      return key === 'object-1' ? undefined : new Uint8Array([1])
    },
  }
  const picture = {
    extractor: {
      async extract() {
        calls.extracted += 1
        return GOOD_FACE
      },
    },
    picture: {
      async apply() {
        calls.applied += 1
        return { applied: calls.applied !== 2 }
      },
    },
  }
  return { calls, picture, reader, source }
}

describe('backfill da foto da CNH', () => {
  test('o padrão é dry-run; só --confirm grava', () => {
    expect(resolveBackfillMode([])).toBe('dry-run')
    expect(resolveBackfillMode(['--dry-run'])).toBe('dry-run')
    expect(resolveBackfillMode(['--confirm'])).toBe('confirm')
  })

  test('dry-run conta todos os pendentes (em lotes) sem ler objeto, detectar nem chamar a API', async () => {
    const harness = buildHarness(buildCandidates(5))

    const result = await runCnhPictureBackfill({
      batchSize: 2,
      mode: 'dry-run',
      source: harness.source,
    })

    expect(result).toEqual({
      applied: 0,
      candidates: 5,
      failed: 0,
      keptExisting: 0,
      mode: 'dry-run',
      objectMissing: 0,
      skipped: 0,
    })
    expect(harness.calls).toMatchObject({ applied: 0, extracted: 0, read: 0 })
    expect(harness.calls.listed).toHaveLength(3)
  })

  test('confirm processa cada pendente uma vez e separa aplicada, mantida e objeto ausente', async () => {
    const harness = buildHarness(buildCandidates(4))

    const result = await runCnhPictureBackfill({
      batchSize: 2,
      mode: 'confirm',
      picture: harness.picture,
      reader: harness.reader,
      source: harness.source,
    })

    expect(result).toEqual({
      applied: 2,
      candidates: 4,
      failed: 0,
      keptExisting: 1,
      mode: 'confirm',
      objectMissing: 1,
      skipped: 0,
    })
  })

  test('confirm sem as dependências de escrita falha antes de tocar em qualquer coisa', async () => {
    const harness = buildHarness(buildCandidates(1))

    await expect(
      runCnhPictureBackfill({ mode: 'confirm', source: harness.source }),
    ).rejects.toThrow()
    expect(harness.calls.applied).toBe(0)
  })

  test('sem pendentes devolve zeros', async () => {
    const harness = buildHarness([])

    expect(
      (await runCnhPictureBackfill({ mode: 'dry-run', source: harness.source })).candidates,
    ).toBe(0)
  })
})

describe('paridade com a API', () => {
  test('o caminho que o worker chama é o que a API declara', async () => {
    const constants = await readFile(new URL('shared/api.constant.ts', API_SOURCE), 'utf8')

    expect(constants).toContain(
      `API_FLEET_DRIVER_ATTACHMENT_CNH_PICTURE_PATH =\n  '${CNH_PICTURE_API_PATH_TEMPLATE}'`,
    )
  })

  test('o SQL do backfill só usa tabelas e colunas que a API cria', async () => {
    const [fleet, picture, storage, attachment, identity] = await Promise.all(
      [
        'database/fleet.schema.ts',
        'database/identity-user-picture.schema.ts',
        'database/storage.schema.ts',
        'database/fleet-driver-attachment.schema.ts',
        'database/identity.schema.ts',
      ].map((path) => readFile(new URL(path, API_SOURCE), 'utf8')),
    )

    expect(fleet).toContain("pgTable(\n  'fleet_drivers'")
    expect(fleet).toContain("membershipId: uuid('membership_id')")
    expect(picture).toContain("pgTable(\n  'identity_user_pictures'")
    expect(picture).toContain("uuid('user_id')")
    expect(picture).toContain("publishedAt: timestamp('published_at'")
    expect(picture).toContain('origin: text()')
    expect(identity).toContain("'external_identities'")
    expect(storage).toContain("'stored_objects'")
    expect(storage).toContain("objectKey: text('object_key')")
    expect(attachment).toContain("storedObjectId: uuid('stored_object_id')")
    expect(identity).toContain("'user_company_memberships'")
  })
})
