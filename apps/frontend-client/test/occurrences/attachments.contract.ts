/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10, emenda à ADR-0073): o anexo no portal. A contratante escolhe pelo seletor
 * nativo — sem câmera nem microfone —, a tela recusa antes de subir o que a API recusaria (a lista e
 * os tetos do portal, com paridade lida da política da API) e o arquivo sobe direto ao bucket pela
 * URL assinada, **sem o token**. A leitura traz o anexo sem id nenhum.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  PORTAL_ATTACHMENT_CONTENT_TYPES,
  PORTAL_ATTACHMENT_LIMITS,
  pickPortalAttachments,
  uploadPortalAttachments,
} from '../../src/modules/occurrences/shared/conversationAttachment.service'
import { createPortalClient } from '../../src/modules/shared/portalClient.service'
import { toConversation } from '../../src/modules/shared/portalResponse.validation'

const API_POLICY = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/conversation-attachment.policy.ts',
  import.meta.url,
)
const API_URL = 'https://api.exemplo.test'
const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'
const MB = 1024 * 1024

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

describe('a lista e os tetos do portal são os da API (spec 183 T702b)', () => {
  test('os mesmos tipos e o teto do canal portal', async () => {
    const policy = await readFile(API_POLICY, 'utf8')
    const apiTypes = [...policy.matchAll(/^ {2}'([a-z]+\/[^']+)': '(?:audio|document|image)',$/gmu)]

    expect(apiTypes.map((match) => match[1]).sort()).toEqual(
      Object.keys(PORTAL_ATTACHMENT_CONTENT_TYPES).sort(),
    )
    for (const [contentType, kind] of Object.entries(PORTAL_ATTACHMENT_CONTENT_TYPES)) {
      expect(policy).toInclude(`'${contentType}': '${kind}'`)
    }
    expect(policy).toInclude(
      `portal: { audio: ${String(PORTAL_ATTACHMENT_LIMITS.audio / MB)} * MB, document: ${String(PORTAL_ATTACHMENT_LIMITS.document / MB)} * MB, image: ${String(PORTAL_ATTACHMENT_LIMITS.image / MB)} * MB }`,
    )
  })
})

describe('escolher e subir no portal (spec 183 T702b)', () => {
  test('recusa tipo, tamanho e o sexto arquivo, com o motivo em português', () => {
    const picked = pickPortalAttachments(
      [file('a.pdf', 'application/pdf', 10), file('b.pdf', 'application/pdf', 10)],
      [
        file('desenho.svg', 'image/svg+xml', 10),
        file('grande.png', 'image/png', 11 * MB),
        file('c.pdf', 'application/pdf', 10),
        file('d.pdf', 'application/pdf', 10),
        file('e.pdf', 'application/pdf', 10),
        file('f.pdf', 'application/pdf', 10),
      ],
    )

    expect(picked.files.map((item) => item.name)).toEqual([
      'a.pdf',
      'b.pdf',
      'c.pdf',
      'd.pdf',
      'e.pdf',
    ])
    expect(picked.messages).toEqual([
      'desenho.svg: este tipo de arquivo não é aceito.',
      'grande.png: passa do limite de 10 MB.',
      'f.pdf: são no máximo 5 anexos por mensagem.',
    ])
  })

  test('sobe um por um e reusa o que já subiu no reenvio', async () => {
    const uploaded = new Map<File, string>()
    const first = file('a.pdf', 'application/pdf', 3)
    const second = file('b.jpg', 'image/jpeg', 4)
    let requests = 0
    let failSecond = true
    const run = () =>
      uploadPortalAttachments({
        files: [first, second],
        putFile: async ({ file: sent }) => {
          await Promise.resolve()
          if (sent === second && failSecond) throw new Error('rede caiu')
        },
        requestUpload: async () => {
          await Promise.resolve()
          requests += 1
          return { uploadId: `upload-${String(requests)}`, uploadUrl: 'https://s3.exemplo.test/t' }
        },
        uploaded,
      })

    expect(await failure(run)).toBeInstanceOf(Error)
    failSecond = false

    expect(await run()).toEqual(['upload-1', 'upload-3'])
  })
})

describe('o cliente do anexo no portal (spec 183 T702b)', () => {
  function createClient(responses: Response[], calls: { init?: RequestInit; url: string }[]) {
    return createPortalClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        calls.push({
          ...(init === undefined ? {} : { init }),
          url: input instanceof Request ? input.url : input.toString(),
        })
        return Promise.resolve(responses.shift() ?? new Response(null, { status: 500 }))
      },
      getAccessToken: () => Promise.resolve('token-sintetico'),
    })
  }

  test('pede a URL pela referência e envia a mensagem com os anexos', async () => {
    const calls: { init?: RequestInit; url: string }[] = []
    const client = createClient(
      [
        Response.json(
          {
            data: { expiresAt: 'x', uploadId: 'upload-1', uploadUrl: 'https://s3.exemplo.test/t' },
          },
          { status: 201 },
        ),
        Response.json({ data: { createdAt: 'x' } }, { status: 201 }),
      ],
      calls,
    )

    const upload = await client.requestConversationUpload({
      contentType: 'application/pdf',
      fileName: 'nota-devolucao.pdf',
      ref: REF,
      sizeBytes: 3,
    })
    await client.sendConversationMessage({
      attachmentIds: [upload.uploadId],
      body: '',
      idempotencyKey: 'portal-message:1',
      ref: REF,
    })

    expect(calls[0]?.url).toBe(`${API_URL}/client/me/occurrence-conversations/${REF}/uploads`)
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      contentType: 'application/pdf',
      fileName: 'nota-devolucao.pdf',
      sizeBytes: 3,
    })
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({
      attachmentIds: ['upload-1'],
      body: '',
    })
  })

  test('o envio sem anexo continua só com o texto', async () => {
    const calls: { init?: RequestInit; url: string }[] = []
    const client = createClient([Response.json({ data: {} }, { status: 201 })], calls)

    await client.sendConversationMessage({
      body: 'Oi',
      idempotencyKey: 'portal-message:2',
      ref: REF,
    })

    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ body: 'Oi' })
  })

  test('o PUT vai ao bucket sem o token; recusa do bucket é erro', async () => {
    const calls: { init?: RequestInit; url: string }[] = []
    const client = createClient(
      [new Response(null, { status: 200 }), new Response('BadDigest', { status: 400 })],
      calls,
    )
    const sent = file('a.pdf', 'application/pdf', 3)

    await client.putConversationUpload({ file: sent, url: 'https://s3.exemplo.test/t?sig=1' })

    expect(calls[0]?.url).toBe('https://s3.exemplo.test/t?sig=1')
    expect(calls[0]?.init?.method).toBe('PUT')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBeNull()
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/pdf')
    expect(
      await failure(() =>
        client.putConversationUpload({ file: sent, url: 'https://s3.exemplo.test/t' }),
      ),
    ).toBeInstanceOf(Error)
  })
})

describe('a leitura do anexo no portal (spec 183 T702b)', () => {
  test('o anexo chega sem id; o que vier a mais não passa, e o malformado sai', () => {
    const conversation = toConversation({
      data: {
        messages: [
          {
            attachments: [
              {
                contentType: 'image/jpeg',
                fileName: 'canhoto.jpg',
                id: 'nao-deveria-vir',
                sizeBytes: 4096,
                url: 'https://s3.exemplo.test/token',
              },
              { fileName: 'sem-url.pdf' },
            ],
            body: '',
            channel: 'portal',
            createdAt: '2026-09-25T12:00:00.000Z',
            mine: true,
            side: 'contractor',
          },
          {
            body: 'Oi',
            channel: 'email',
            createdAt: '2026-09-25T12:01:00.000Z',
            mine: false,
            side: 'carrier',
          },
        ],
        unreadCount: 0,
      },
    })

    expect(conversation.messages.map((message) => message.attachments)).toEqual([
      [
        {
          contentType: 'image/jpeg',
          fileName: 'canhoto.jpg',
          sizeBytes: 4096,
          url: 'https://s3.exemplo.test/token',
        },
      ],
      [],
    ])
  })
})

describe('o anexo na tela do portal (spec 183 T702b)', () => {
  test('seletor nativo sem captura: a contratante anexa, não fotografa nem grava', async () => {
    const component = await readFile(
      new URL(
        '../../src/modules/occurrences/OccurrenceConversation.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(component).toMatch(/type="file"/u)
    expect(component).not.toMatch(/capture=/u)
    expect(component).not.toMatch(/getUserMedia|MediaRecorder/u)
    expect(component).toMatch(/<a[\s\S]*?download=/u)
  })
})
