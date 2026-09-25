/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c1 (RF10): os anexos do e-mail que a contratante responde viram anexos da mensagem da
 * conversa, a partir do MIME já baixado. Só entra o que a política da API aceitaria pelo canal
 * e-mail — tipo da lista conferido **pelos bytes**, até 10 MB, no máximo cinco —; a imagem embutida
 * na assinatura (`inline`) não é anexo. A chave do objeto é o token aleatório da API, sem id interno.
 * O que não vira anexo só conta: nome de arquivo nunca vai a log.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  createInboundConversationAttachmentStore,
  extractInboundMailAttachments,
} from '../../src/occurrence-conversation/application/inbound-mail-attachments.service.js'

const API_POLICY = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/conversation-attachment.policy.ts',
  import.meta.url,
)
const WORKER_POLICY = new URL(
  '../../src/occurrence-conversation/domain/conversation-attachment.policy.ts',
  import.meta.url,
)
const API_SCHEMA = new URL(
  '../../../api-transportada/src/database/occurrence-conversation.schema.ts',
  import.meta.url,
)
const WORKER_SCHEMA = new URL(
  '../../src/database/occurrence-conversation.schema.ts',
  import.meta.url,
)

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])

type Part = {
  readonly bytes: Buffer
  readonly contentType: string
  readonly disposition: 'attachment' | 'inline'
  readonly fileName: string
}

function mime(parts: readonly Part[]): Buffer {
  const boundary = 'limite-183'
  const lines = [
    'From: Financeiro Alfa <financeiro@alfa.example.test>',
    'To: token@resposta.example.test',
    'Subject: Re: Ocorrência',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Segue a nota de devolução.',
  ]
  for (const part of parts) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${part.contentType}; name="${part.fileName}"`,
      `Content-Disposition: ${part.disposition}; filename="${part.fileName}"`,
      'Content-Transfer-Encoding: base64',
      ...(part.disposition === 'inline' ? ['Content-ID: <logo@alfa>'] : []),
      '',
      part.bytes.toString('base64'),
    )
  }
  lines.push(`--${boundary}--`, '')
  return Buffer.from(lines.join('\r\n'))
}

describe('a política do anexo é a da API (spec 183 T702c1)', () => {
  test('cópia por valor, byte a byte', async () => {
    const [api, worker] = await Promise.all([
      readFile(API_POLICY, 'utf8'),
      readFile(WORKER_POLICY, 'utf8'),
    ])

    expect(worker).toBe(api)
  })

  test('as colunas do anexo na cópia do worker existem iguais na API', async () => {
    const [api, worker] = await Promise.all([
      readFile(API_SCHEMA, 'utf8'),
      readFile(WORKER_SCHEMA, 'utf8'),
    ])
    const table = worker.slice(worker.indexOf("pgTable('occurrence_conversation_attachments'"))
    const columns = table
      .split('\n')
      .filter((line) => /^\s+[a-zA-Z]+: (uuid|text|integer|timestamp)\(.*,$/u.test(line))

    expect(columns.length).toBe(9)
    for (const column of columns) expect(api).toInclude(column.trim())
  })
})

describe('extrair os anexos do MIME (spec 183 T702c1)', () => {
  test('PDF e imagem entram; logo embutido, SVG, tipo mentiroso e o sexto ficam fora', async () => {
    const raw = mime([
      {
        bytes: PDF,
        contentType: 'application/pdf',
        disposition: 'attachment',
        fileName: 'nota-devolucao.pdf',
      },
      { bytes: PNG, contentType: 'image/png', disposition: 'inline', fileName: 'logo.png' },
      {
        bytes: Buffer.from('<svg/>'),
        contentType: 'image/svg+xml',
        disposition: 'attachment',
        fileName: 'x.svg',
      },
      {
        bytes: JPEG,
        contentType: 'application/pdf',
        disposition: 'attachment',
        fileName: 'falso.pdf',
      },
      { bytes: JPEG, contentType: 'image/jpeg', disposition: 'attachment', fileName: 'caixa.jpg' },
      { bytes: PDF, contentType: 'application/pdf', disposition: 'attachment', fileName: 'b.pdf' },
      { bytes: PDF, contentType: 'application/pdf', disposition: 'attachment', fileName: 'c.pdf' },
      { bytes: PDF, contentType: 'application/pdf', disposition: 'attachment', fileName: 'd.pdf' },
      { bytes: PDF, contentType: 'application/pdf', disposition: 'attachment', fileName: 'e.pdf' },
    ])

    const extracted = await extractInboundMailAttachments(new Uint8Array(raw))

    expect(extracted.accepted.map((item) => [item.fileName, item.contentType])).toEqual([
      ['nota-devolucao.pdf', 'application/pdf'],
      ['caixa.jpg', 'image/jpeg'],
      ['b.pdf', 'application/pdf'],
      ['c.pdf', 'application/pdf'],
      ['d.pdf', 'application/pdf'],
    ])
    expect(Buffer.from(extracted.accepted[0]?.bytes ?? [])).toEqual(PDF)
    /** SVG, o PDF que é JPEG e o sexto aceito; o logo `inline` não é anexo nem recusa. */
    expect(extracted.skipped).toBe(3)
  })

  test('e-mail sem anexo, ou MIME ilegível, não tem anexo — e não derruba a resposta', async () => {
    expect(await extractInboundMailAttachments(new Uint8Array(mime([])))).toEqual({
      accepted: [],
      skipped: 0,
    })
    expect(await extractInboundMailAttachments(new Uint8Array([0, 1, 2]))).toEqual({
      accepted: [],
      skipped: 0,
    })
  })

  test('o nome vem limpo: só a última parte do caminho', async () => {
    const extracted = await extractInboundMailAttachments(
      new Uint8Array(
        mime([
          {
            bytes: PDF,
            contentType: 'application/pdf',
            disposition: 'attachment',
            fileName: '../../pasta/nota.pdf',
          },
        ]),
      ),
    )

    expect(extracted.accepted[0]?.fileName).toBe('nota.pdf')
  })
})

describe('guardar e descartar os anexos (spec 183 T702c1)', () => {
  test('cada anexo vai ao bucket com chave opaca, sha256 e tipo; descartar apaga os mesmos', async () => {
    const stored: { contentType: string; key: string; sha256: string }[] = []
    const deleted: string[] = []
    let token = 0
    const store = createInboundConversationAttachmentStore({
      bucket: 'bucket-privado',
      newToken: () => `token-${String((token += 1))}`,
      provider: 'minio',
      storage: {
        deleteObject: async ({ key }) => void deleted.push(key),
        storeObject: async (input) => void stored.push(input),
      },
    })
    const raw = mime([
      {
        bytes: PDF,
        contentType: 'application/pdf',
        disposition: 'attachment',
        fileName: 'nota.pdf',
      },
      {
        bytes: Buffer.from('<svg/>'),
        contentType: 'image/svg+xml',
        disposition: 'attachment',
        fileName: 'x.svg',
      },
    ])

    const result = await store.store(new Uint8Array(raw))

    expect(result.skipped).toBe(1)
    expect(result.stored).toEqual([
      {
        bucket: 'bucket-privado',
        contentType: 'application/pdf',
        fileName: 'nota.pdf',
        key: 'occurrence-conversations/token-1',
        provider: 'minio',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        sizeBytes: PDF.byteLength,
      },
    ])
    expect(stored.map((item) => [item.key, item.contentType])).toEqual([
      ['occurrence-conversations/token-1', 'application/pdf'],
    ])

    await store.discard(result.stored)
    expect(deleted).toEqual(['occurrence-conversations/token-1'])
  })
})
