/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o pedido de upload e a ligação do anexo à mensagem. O pedido recusa antes
 * de subir o que está fora do tipo ou do teto do canal, com o teto na resposta; a chave do objeto
 * não leva nome nem PII. No envio, cada pedido é conferido pelo objeto de verdade — existe, cabe no
 * teto, os bytes batem com o tipo — e só então vira anexo, com o sha256 dos bytes.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import type {
  ConversationAttachmentStoragePort,
  ConversationAttachmentTransactionPort,
  ConversationUploadTarget,
  PendingConversationUpload,
} from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import {
  attachConversationUploads,
  CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS,
  requestConversationUpload,
  signConversationAttachments,
} from '../../src/occurrence-conversation/application/conversation-attachment.service.js'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const TARGET: ConversationUploadTarget = {
  channel: 'app',
  companyId: '00000000-0000-4000-8000-000000000001',
  occurrenceId: '00000000-0000-4000-8000-000000000002',
  occurrenceKind: 'document',
  participant: 'driver',
  requestedByUserId: '00000000-0000-4000-8000-000000000003',
}
const PDF = new TextEncoder().encode('%PDF-1.7 conteúdo do comprovante')

function storage(objects: Record<string, Uint8Array>) {
  const signed: unknown[] = []
  const port: ConversationAttachmentStoragePort = {
    createSignedDownload: async (input) => {
      signed.push(input)
      return new URL(`https://s3.test/${input.key}?download`)
    },
    createSignedUpload: async (input) => {
      signed.push(input)
      return new URL(`https://s3.test/${input.key}?upload`)
    },
    getObjectStream: async ({ key }) => new Blob([objects[key] ?? new Uint8Array()]).stream(),
    headObject: async ({ key }) =>
      objects[key] === undefined ? undefined : { contentLength: objects[key].byteLength },
  }
  return { port, signed }
}

describe('o pedido de upload do anexo (spec 183 T702a)', () => {
  test('grava o pedido e devolve a URL assinada com vida curta e a chave sem nome', async () => {
    const inserted: unknown[] = []
    const { port, signed } = storage({})

    const result = await requestConversationUpload({
      bucket: 'bucket-test',
      contentType: 'application/pdf',
      fileName: '../comprovante da descarga.pdf',
      newId: () => 'upload-1',
      newObjectToken: () => 'token-opaco-1',
      now: NOW,
      repository: { insertUpload: async (input) => void inserted.push(input) },
      sizeBytes: 2048,
      storage: port,
      target: TARGET,
    })

    /**
     * A chave vai dentro da URL assinada que o portal recebe: nenhum id interno (empresa, ocorrência,
     * pedido), só um token aleatório.
     */
    const objectKey = 'occurrence-conversations/token-opaco-1'
    expect(objectKey).not.toContain(TARGET.companyId)
    expect(result).toEqual({
      expiresAt: new Date(
        NOW.getTime() + CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      uploadId: 'upload-1',
      uploadUrl: `https://s3.test/${objectKey}?upload`,
    })
    expect(inserted).toEqual([
      {
        ...TARGET,
        bucket: 'bucket-test',
        declaredContentType: 'application/pdf',
        declaredSizeBytes: 2048,
        expiresAt: new Date(NOW.getTime() + 900_000),
        fileName: 'comprovante da descarga.pdf',
        id: 'upload-1',
        objectKey,
      },
    ])
    expect(signed).toEqual([
      {
        bucket: 'bucket-test',
        contentLength: 2048,
        contentType: 'application/pdf',
        expiresInSeconds: 900,
        key: objectKey,
      },
    ])
  })

  test.each([
    ['tipo fora da lista', 'text/html', 10, { field: 'attachment.type' }],
    [
      'acima do teto do canal',
      'image/jpeg',
      10 * 1024 * 1024 + 1,
      { field: 'attachment.size', message: 'the file must have from 1 to 10485760 bytes' },
    ],
  ] as const)(
    '%s é 422 antes de subir, com o motivo',
    async (_label, contentType, sizeBytes, details) => {
      const inserted: unknown[] = []
      await expect(
        requestConversationUpload({
          bucket: 'bucket-test',
          contentType,
          fileName: 'x',
          newId: () => 'upload-1',
          now: NOW,
          repository: { insertUpload: async (input) => void inserted.push(input) },
          sizeBytes,
          storage: storage({}).port,
          target: TARGET,
        }),
      ).rejects.toMatchObject({
        code: 'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED',
        details: [expect.objectContaining(details)],
        status: 422,
      })
      expect(inserted).toEqual([])
    },
  )
})

describe('a ligação do anexo à mensagem (spec 183 T702a)', () => {
  function pending(overrides: Partial<PendingConversationUpload> = {}): PendingConversationUpload {
    return {
      bucket: 'bucket-test',
      declaredContentType: 'application/pdf',
      expiresAt: new Date(NOW.getTime() + 60_000),
      fileName: 'comprovante.pdf',
      id: 'upload-1',
      objectKey: 'key-1',
      ...overrides,
    }
  }

  function transaction(rows: readonly PendingConversationUpload[]) {
    const attached: unknown[] = []
    const locked: unknown[] = []
    const port: ConversationAttachmentTransactionPort = {
      attachUpload: async (input) => void attached.push(input),
      lockPendingUploads: async (input) => {
        locked.push(input)
        return rows.filter((row) => input.ids.includes(row.id))
      },
    }
    return { attached, locked, port }
  }

  test('confere pelos bytes e grava o anexo com o sha256 do conteúdo', async () => {
    const { attached, locked, port } = transaction([pending()])

    await attachConversationUploads({
      messageId: 'message-1',
      now: NOW,
      storage: storage({ 'key-1': PDF }).port,
      target: TARGET,
      transaction: port,
      uploadIds: ['upload-1'],
    })

    expect(locked).toEqual([{ ids: ['upload-1'], target: TARGET }])
    expect(attached).toEqual([
      {
        bucket: 'bucket-test',
        companyId: TARGET.companyId,
        contentType: 'application/pdf',
        fileName: 'comprovante.pdf',
        messageId: 'message-1',
        now: NOW,
        objectKey: 'key-1',
        sha256: createHash('sha256').update(PDF).digest('hex'),
        sizeBytes: PDF.byteLength,
        uploadId: 'upload-1',
      },
    ])
  })

  test('sem anexo não abre nada', async () => {
    const { locked, port } = transaction([])

    await attachConversationUploads({
      messageId: 'message-1',
      now: NOW,
      storage: storage({}).port,
      target: TARGET,
      transaction: port,
      uploadIds: [],
    })
    expect(locked).toEqual([])
  })

  test.each([
    [
      'pedido de outra pessoa ou conversa (não volta do banco)',
      [],
      {},
      ['upload-1'],
      'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
    ],
    [
      'pedido repetido na mesma mensagem',
      [pending()],
      { 'key-1': PDF },
      ['upload-1', 'upload-1'],
      'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
    ],
    [
      'mais de cinco',
      [],
      {},
      ['a', 'b', 'c', 'd', 'e', 'f'],
      'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
    ],
    [
      'pedido vencido',
      [pending({ expiresAt: new Date(NOW.getTime() - 1) })],
      { 'key-1': PDF },
      ['upload-1'],
      'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
    ],
    [
      'objeto que nunca subiu',
      [pending()],
      {},
      ['upload-1'],
      'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
    ],
    [
      'bytes que não batem com o tipo',
      [pending()],
      { 'key-1': new TextEncoder().encode('<html>') },
      ['upload-1'],
      'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED',
    ],
    [
      'acima do teto do canal',
      [pending({ declaredContentType: 'image/jpeg' })],
      { 'key-1': new Uint8Array(10 * 1024 * 1024 + 1).fill(0xff) },
      ['upload-1'],
      'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED',
    ],
  ] as const)('%s é 422 sem gravar', async (_label, rows, objects, uploadIds, code) => {
    const { attached, port } = transaction(rows)

    await expect(
      attachConversationUploads({
        messageId: 'message-1',
        now: NOW,
        storage: storage(objects).port,
        target: TARGET,
        transaction: port,
        uploadIds,
      }),
    ).rejects.toMatchObject({ code, status: 422 })
    expect(attached).toEqual([])
  })
})

describe('a leitura do anexo (spec 183 T702a)', () => {
  test('cada anexo sai com URL de cinco minutos, para baixar com o nome', async () => {
    const { port, signed } = storage({})

    const views = await signConversationAttachments(port, [
      {
        bucket: 'bucket-test',
        contentType: 'application/pdf',
        fileName: 'comprovante.pdf',
        id: 'attachment-1',
        messageId: 'message-1',
        objectKey: 'key-1',
        sizeBytes: 2048,
      },
    ])

    expect(views.get('message-1')).toEqual([
      {
        contentType: 'application/pdf',
        fileName: 'comprovante.pdf',
        id: 'attachment-1',
        sizeBytes: 2048,
        url: 'https://s3.test/key-1?download',
      },
    ])
    expect(signed).toEqual([
      {
        bucket: 'bucket-test',
        disposition: 'attachment',
        expiresInSeconds: 300,
        filename: 'comprovante.pdf',
        key: 'key-1',
      },
    ])
  })
})
