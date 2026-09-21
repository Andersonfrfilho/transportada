/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T3 (RF15/RF26, CA5/CA8). O ponto único de leitura do anexo da ocorrência de galpão —
 * sem banco, sem HTTP: repositório e downloads são dublês.
 */
import { describe, expect, test } from 'bun:test'

import { readOccurrenceAttachments } from '../../src/trips/application/occurrence-attachment.service.js'
import type {
  OccurrenceAttachmentRecord,
  ReadOccurrenceAttachmentsPort,
} from '../../src/trips/application/occurrence-attachment.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000021'
const NOW = new Date('2026-09-21T12:00:00.000Z')

const ORIGINAL_A: OccurrenceAttachmentRecord = {
  id: '00000000-0000-4000-8000-0000000000a1',
  original: {
    bucket: 'transportada',
    mimeType: 'image/jpeg',
    objectKey: 'tenants/1/trip-occurrence-attachments/21/a1',
    retentionUntil: '2031-09-21T12:00:00.000Z',
  },
  position: 1,
  thumbnail: {
    bucket: 'transportada',
    mimeType: 'image/jpeg',
    objectKey: 'tenants/1/trip-occurrence-attachments/21/thumbnails/a1',
    retentionUntil: '2031-09-21T12:00:00.000Z',
  },
}

const ORIGINAL_WITHOUT_THUMBNAIL: OccurrenceAttachmentRecord = {
  ...ORIGINAL_A,
  id: '00000000-0000-4000-8000-0000000000a2',
  position: 2,
  thumbnail: null,
}

const EXPIRED: OccurrenceAttachmentRecord = {
  id: '00000000-0000-4000-8000-0000000000a3',
  original: {
    bucket: 'transportada',
    mimeType: 'image/jpeg',
    objectKey: 'tenants/1/trip-occurrence-attachments/21/a3',
    retentionUntil: '2020-01-01T00:00:00.000Z',
  },
  position: 1,
  thumbnail: null,
}

const LEGACY: OccurrenceAttachmentRecord = {
  id: OCCURRENCE_ID,
  original: {
    bucket: 'transportada',
    mimeType: 'image/jpeg',
    objectKey: 'tenants/1/trip-occurrence-attachments/legacy',
    retentionUntil: null,
  },
  position: 1,
  thumbnail: null,
}

function repository(input: {
  readonly legacy?: OccurrenceAttachmentRecord | null
  readonly rows?: readonly OccurrenceAttachmentRecord[]
}) {
  const calls: { readonly method: string; readonly input: object }[] = []
  const port: ReadOccurrenceAttachmentsPort = {
    async findLegacyOccurrenceAttachment(callInput) {
      calls.push({ input: callInput, method: 'findLegacyOccurrenceAttachment' })
      return input.legacy ?? null
    },
    async listOccurrenceAttachments(callInput) {
      calls.push({ input: callInput, method: 'listOccurrenceAttachments' })
      return input.rows ?? []
    },
  }
  return { calls, port }
}

const downloads = {
  async createDownloadUrl(input: { readonly objectKey: string }) {
    return {
      expiresAt: '2026-09-21T12:05:00.000Z',
      url: `https://bucket.example/${input.objectKey}?assinatura=abc`,
    }
  },
}

describe('leitura unificada do anexo da ocorrência (spec 161 T3)', () => {
  test('ocorrência sem anexo devolve lista vazia', async () => {
    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: repository({}).port,
    })

    expect(views).toEqual([])
  })

  /** RF15/D6: sem linha na tabela nova, a coluna antiga é o anexo único de `position: 1`. */
  test('só a coluna antiga devolve um item, sempre sem thumbnailUrl', async () => {
    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: repository({ legacy: LEGACY }).port,
    })

    expect(views).toEqual([
      {
        downloadUrl:
          'https://bucket.example/tenants/1/trip-occurrence-attachments/legacy?assinatura=abc',
        expired: false,
        expiresAt: '2026-09-21T12:05:00.000Z',
        id: OCCURRENCE_ID,
        mimeType: 'image/jpeg',
        position: 1,
      },
    ])
    expect(views[0]).not.toHaveProperty('thumbnailUrl')
  })

  /** RF15: linha na tabela nova nunca soma com a coluna antiga — a leitura não consulta a legada. */
  test('tabela nova com miniatura devolve downloadUrl e thumbnailUrl, sem consultar a coluna antiga', async () => {
    const { calls, port } = repository({ rows: [ORIGINAL_A] })

    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: port,
    })

    expect(views).toEqual([
      {
        downloadUrl:
          'https://bucket.example/tenants/1/trip-occurrence-attachments/21/a1?assinatura=abc',
        expired: false,
        expiresAt: '2026-09-21T12:05:00.000Z',
        id: ORIGINAL_A.id,
        mimeType: 'image/jpeg',
        position: 1,
        thumbnailUrl:
          'https://bucket.example/tenants/1/trip-occurrence-attachments/21/thumbnails/a1?assinatura=abc',
      },
    ])
    expect(calls.map((call) => call.method)).toEqual(['listOccurrenceAttachments'])
  })

  /** RF29b: falha de geração da miniatura no cliente não impede a leitura do original. */
  test('tabela nova sem miniatura devolve downloadUrl, sem thumbnailUrl', async () => {
    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: repository({ rows: [ORIGINAL_WITHOUT_THUMBNAIL] }).port,
    })

    expect(views[0]).not.toHaveProperty('thumbnailUrl')
    expect(views[0]?.downloadUrl).toBeString()
  })

  /** RF26: a retenção vencida é `expired: true` sem nenhuma URL — a data decide, não o expurgo. */
  test('retenção vencida devolve expired sem downloadUrl nem thumbnailUrl', async () => {
    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: repository({ rows: [EXPIRED] }).port,
    })

    expect(views).toEqual([
      {
        expired: true,
        id: EXPIRED.id,
        mimeType: 'image/jpeg',
        position: 1,
      },
    ])
    expect(views[0]).not.toHaveProperty('downloadUrl')
    expect(views[0]).not.toHaveProperty('thumbnailUrl')
    expect(views[0]).not.toHaveProperty('expiresAt')
  })

  test('a leitura nunca publica objectKey nem bucket', async () => {
    const views = await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: repository({ rows: [ORIGINAL_A] }).port,
    })

    expect(JSON.stringify(views)).not.toInclude('"objectKey"')
    expect(JSON.stringify(views)).not.toInclude('"bucket"')
  })

  test('a consulta é sempre escopada pela empresa e pela ocorrência do contexto', async () => {
    const { calls, port } = repository({})

    await readOccurrenceAttachments({
      companyId: COMPANY_ID,
      downloads,
      now: () => NOW,
      occurrenceId: OCCURRENCE_ID,
      repository: port,
    })

    expect(calls).toEqual([
      {
        input: { companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID },
        method: 'listOccurrenceAttachments',
      },
      {
        input: { companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID },
        method: 'findLegacyOccurrenceAttachment',
      },
    ])
  })
})
