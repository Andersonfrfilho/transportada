/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10): o anexo no painel. A tela recusa antes de subir o que a API recusaria (tipo
 * fora da lista, acima do teto do canal, mais de cinco), com a mesma lista da API — o contrato de
 * paridade lê a política de lá. Subir é pedir a URL à API e mandar o arquivo **direto** ao
 * armazenamento, sem o token (a URL já é a autorização). A leitura traz os anexos de cada mensagem.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  CONVERSATION_ATTACHMENT_CONTENT_TYPES,
  CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES,
  CONVERSATION_ATTACHMENT_LIMITS,
  pickConversationAttachments,
  uploadConversationAttachments,
} from '@/modules/occurrence-conversation/shared/conversationAttachment.service'
import { createDriverConversationClient } from '@/modules/occurrence-conversation/shared/driverConversationClient.service'
import { validateDriverMessageDraft } from '@/modules/occurrence-conversation/shared/occurrenceConversation.service'
import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const API_POLICY = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/conversation-attachment.policy.ts',
  import.meta.url,
)
const API_URL = 'https://api.example.test'

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}
const MB = 1024 * 1024

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('a lista e os tetos são os da API (spec 183 T702b)', () => {
  test('os mesmos tipos, os tetos do app, do e-mail e do portal e o total do e-mail', async () => {
    const policy = await readFile(API_POLICY, 'utf8')

    for (const [contentType, kind] of Object.entries(CONVERSATION_ATTACHMENT_CONTENT_TYPES)) {
      expect(policy).toInclude(`'${contentType}': '${kind}'`)
    }
    const apiTypes = [...policy.matchAll(/^ {2}'([a-z]+\/[^']+)': '(?:audio|document|image)',$/gmu)]
    expect(apiTypes.map((match) => match[1]).sort()).toEqual(
      Object.keys(CONVERSATION_ATTACHMENT_CONTENT_TYPES).sort(),
    )
    for (const channel of ['app', 'email', 'portal'] as const) {
      const limits = CONVERSATION_ATTACHMENT_LIMITS[channel]
      expect(policy).toInclude(
        `${channel}: { audio: ${String(limits.audio / MB)} * MB, document: ${String(limits.document / MB)} * MB, image: ${String(limits.image / MB)} * MB }`,
      )
    }
    /** Spec 183 T702e: o total que um e-mail leva, somando os arquivos. */
    expect(policy).toInclude(
      `export const CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES = ${String(CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES / MB)} * MB`,
    )
  })
})

describe('escolher os arquivos (spec 183 T702b)', () => {
  test('aceita o que a API aceita e diz por que recusou o resto', () => {
    const picked = pickConversationAttachments({
      channel: 'app',
      current: [file('a.pdf', 'application/pdf', 10)],
      incoming: [
        file('foto.jpg', 'image/jpeg', 2 * MB),
        file('desenho.svg', 'image/svg+xml', 10),
        file('grande.png', 'image/png', 11 * MB),
        file('planilha.csv', 'text/csv', 10),
      ],
    })

    expect(picked.files.map((item) => item.name)).toEqual(['a.pdf', 'foto.jpg', 'planilha.csv'])
    expect(picked.rejected).toEqual([
      { fileName: 'desenho.svg', reason: 'type' },
      { fileName: 'grande.png', maxBytes: 10 * MB, reason: 'size' },
    ])
  })

  test('spec 183 T702e: no e-mail, o arquivo que passa do total somado é recusado pelo total', () => {
    const picked = pickConversationAttachments({
      channel: 'email',
      current: [file('a.pdf', 'application/pdf', 9 * MB), file('b.pdf', 'application/pdf', 9 * MB)],
      incoming: [file('c.pdf', 'application/pdf', 9 * MB), file('d.csv', 'text/csv', 1 * MB)],
    })

    expect(picked.files.map((item) => item.name)).toEqual(['a.pdf', 'b.pdf', 'd.csv'])
    expect(picked.rejected).toEqual([
      {
        fileName: 'c.pdf',
        maxBytes: CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES,
        reason: 'total',
      },
    ])
  })

  test('mais de cinco por mensagem: os de sobra são recusados pelo limite', () => {
    const picked = pickConversationAttachments({
      channel: 'portal',
      current: [],
      incoming: Array.from({ length: 7 }, (_, index) =>
        file(`n${String(index)}.pdf`, 'application/pdf', 10),
      ),
    })

    expect(picked.files).toHaveLength(5)
    expect(picked.rejected).toEqual([
      { fileName: 'n5.pdf', reason: 'limit' },
      { fileName: 'n6.pdf', reason: 'limit' },
    ])
  })
})

describe('subir os anexos (spec 183 T702b)', () => {
  test('pede a URL de cada um, manda o arquivo direto e devolve os ids na ordem', async () => {
    const asked: unknown[] = []
    const puts: { contentType: string; size: number; url: string }[] = []

    const ids = await uploadConversationAttachments({
      files: [file('a.pdf', 'application/pdf', 3), file('b.jpg', 'image/jpeg', 4)],
      putFile: async ({ file: sent, url }) => {
        await Promise.resolve()
        puts.push({ contentType: sent.type, size: sent.size, url })
      },
      requestUpload: async (input) => {
        await Promise.resolve()
        asked.push(input)
        return {
          uploadId: `upload-${input.fileName}`,
          uploadUrl: `https://s3.test/${input.fileName}`,
        }
      },
    })

    expect(ids).toEqual(['upload-a.pdf', 'upload-b.jpg'])
    expect(asked).toEqual([
      { contentType: 'application/pdf', fileName: 'a.pdf', sizeBytes: 3 },
      { contentType: 'image/jpeg', fileName: 'b.jpg', sizeBytes: 4 },
    ])
    expect(puts).toEqual([
      { contentType: 'application/pdf', size: 3, url: 'https://s3.test/a.pdf' },
      { contentType: 'image/jpeg', size: 4, url: 'https://s3.test/b.jpg' },
    ])
  })

  test('falha no meio para tudo: a mensagem não sai com anexo pela metade', async () => {
    let asked = 0
    expect(
      await failure(() =>
        uploadConversationAttachments({
          files: [file('a.pdf', 'application/pdf', 3), file('b.pdf', 'application/pdf', 3)],
          putFile: async () => {
            await Promise.resolve()
            throw new Error('storage down')
          },
          requestUpload: async () => {
            await Promise.resolve()
            asked += 1
            return { uploadId: 'x', uploadUrl: 'https://s3.test/x' }
          },
        }),
      ),
    ).toBeInstanceOf(Error)
    expect(asked).toBe(1)
  })
})

describe('o cliente do anexo (spec 183 T702b)', () => {
  function createClient(responses: Response[], requests: Request[]) {
    return createOccurrenceConversationClient({
      apiUrl: API_URL,
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(responses.shift() ?? new Response(null, { status: 500 }))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
  }

  test('pede a URL pela conversa e canal certos, com o token', async () => {
    const requests: Request[] = []
    const client = createClient(
      [
        Response.json(
          {
            data: {
              expiresAt: '2026-09-25T12:15:00.000Z',
              uploadId: 'upload-1',
              uploadUrl: 'https://s3.test/occurrence-conversations/token?sig=1',
            },
          },
          { status: 201 },
        ),
      ],
      requests,
    )

    const upload = await client.requestConversationUpload({
      channel: 'portal',
      contentType: 'application/pdf',
      fileName: 'a.pdf',
      occurrenceId: 'occurrence-1',
      participant: 'contractor',
      sizeBytes: 3,
    })

    expect(upload).toEqual({
      uploadId: 'upload-1',
      uploadUrl: 'https://s3.test/occurrence-conversations/token?sig=1',
    })
    expect(requests[0]?.url).toBe(
      `${API_URL}/trip-occurrences/occurrence-1/conversations/contractor/uploads`,
    )
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
    expect(await requests[0]?.json()).toEqual({
      channel: 'portal',
      contentType: 'application/pdf',
      fileName: 'a.pdf',
      sizeBytes: 3,
    })
  })

  test('o PUT vai ao armazenamento sem o token, com o tipo do arquivo', async () => {
    const requests: Request[] = []
    const client = createClient([new Response(null, { status: 200 })], requests)

    await client.putConversationUpload({
      file: file('a.pdf', 'application/pdf', 3),
      url: 'https://s3.test/occurrence-conversations/token?sig=1',
    })

    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.url).toBe('https://s3.test/occurrence-conversations/token?sig=1')
    expect(requests[0]?.headers.get('authorization')).toBeNull()
    expect(requests[0]?.headers.get('content-type')).toBe('application/pdf')
  })

  test('o PUT recusado pelo armazenamento é erro, não silêncio', async () => {
    const client = createClient([new Response('BadDigest', { status: 400 })], [])

    expect(
      await failure(() =>
        client.putConversationUpload({
          file: file('a.pdf', 'application/pdf', 3),
          url: 'https://s3.test/x',
        }),
      ),
    ).toBeInstanceOf(Error)
  })

  test('spec 183 T702e: o e-mail leva os anexos só quando há', async () => {
    const requests: Request[] = []
    const client = createClient(
      [Response.json({ data: {} }, { status: 202 }), Response.json({ data: {} }, { status: 202 })],
      requests,
    )
    const request = {
      body: 'Segue.',
      channel: 'email' as const,
      contactIds: ['contact-1'],
      subject: 'Ocorrência',
    }

    await client.sendContractorMail({
      idempotencyKey: 'mail:1',
      occurrenceId: 'occurrence-1',
      request: { ...request, attachmentIds: ['upload-1'] },
    })
    await client.sendContractorMail({
      idempotencyKey: 'mail:2',
      occurrenceId: 'occurrence-1',
      request: { ...request, attachmentIds: [] },
    })

    expect(await requests[0]?.json()).toEqual({ ...request, attachmentIds: ['upload-1'] })
    expect(await requests[1]?.json()).toEqual(request)
  })

  test('o envio pelo app e pelo portal leva os anexos só quando há', async () => {
    const requests: Request[] = []
    const client = createClient(
      [Response.json({ data: {} }, { status: 202 }), Response.json({ data: {} }, { status: 202 })],
      requests,
    )

    await client.sendDriverAppMessage({
      attachmentIds: ['upload-1'],
      body: '',
      idempotencyKey: 'driver-app:1',
      occurrenceId: 'occurrence-1',
    })
    await client.sendContractorPortalMessage({
      attachmentIds: [],
      body: 'Oi',
      idempotencyKey: 'portal:1',
      occurrenceId: 'occurrence-1',
    })

    expect(await requests[0]?.json()).toEqual({
      attachmentIds: ['upload-1'],
      body: '',
      channel: 'app',
    })
    expect(await requests[1]?.json()).toEqual({ body: 'Oi', channel: 'portal' })
  })

  test('a leitura traz os anexos de cada mensagem; anexo malformado sai, a mensagem fica', async () => {
    const client = createClient(
      [
        Response.json({
          data: {
            contractorPortal: { available: false },
            conversations: [
              {
                id: 'conversation-1',
                messages: [
                  {
                    attachments: [
                      {
                        contentType: 'image/jpeg',
                        fileName: 'canhoto.jpg',
                        id: 'attachment-1',
                        sizeBytes: 4096,
                        url: 'https://s3.test/token',
                      },
                      { fileName: 'sem-url.pdf' },
                    ],
                    author: { kind: 'driver', name: 'Ana', userId: 'user-2' },
                    bodyText: '',
                    channel: 'app',
                    createdAt: '2026-09-25T12:00:00.000Z',
                    direction: 'inbound',
                    id: 'message-1',
                    status: null,
                    statusTimes: {},
                  },
                ],
                participant: 'driver',
                status: 'open',
                unreadCount: 0,
              },
            ],
          },
        }),
      ],
      [],
    )

    const view = await client.listConversations({ occurrenceId: 'occurrence-1' })

    expect(view.conversations[0]?.messages[0]?.attachments).toEqual([
      {
        contentType: 'image/jpeg',
        fileName: 'canhoto.jpg',
        id: 'attachment-1',
        sizeBytes: 4096,
        url: 'https://s3.test/token',
      },
    ])
  })
})

describe('o rascunho com anexo e o reenvio (spec 183 T702b)', () => {
  test('texto vazio vale só com anexo', () => {
    expect(validateDriverMessageDraft('   ', 1)).toEqual({ body: '' })
    expect(validateDriverMessageDraft('   ', 0)).toEqual({ error: 'required' })
    expect(validateDriverMessageDraft(' Oi ')).toEqual({ body: 'Oi' })
  })

  test('o reenvio depois de uma falha não sobe de novo o que já subiu: os ids são os mesmos', async () => {
    const uploaded = new Map<File, string>()
    const first = file('a.pdf', 'application/pdf', 3)
    const second = file('b.pdf', 'application/pdf', 3)
    let requests = 0
    let failSecond = true
    const run = () =>
      uploadConversationAttachments({
        files: [first, second],
        putFile: async ({ file: sent }) => {
          await Promise.resolve()
          if (sent === second && failSecond) throw new Error('rede caiu')
        },
        requestUpload: async (input) => {
          await Promise.resolve()
          requests += 1
          return {
            uploadId: `upload-${String(requests)}`,
            uploadUrl: `https://s3.test/${input.fileName}`,
          }
        },
        uploaded,
      })

    expect(await failure(run)).toBeInstanceOf(Error)
    failSecond = false
    const ids = await run()

    expect(ids).toEqual(['upload-1', 'upload-3'])
    expect(requests).toBe(3)
  })
})

describe('o anexo no app do motorista (spec 183 T702b)', () => {
  function createDriverClient(responses: Response[], requests: Request[]) {
    return createDriverConversationClient({
      apiUrl: API_URL,
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(responses.shift() ?? new Response(null, { status: 500 }))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
  }

  test('pede a URL pela ocorrência dele, sem canal no corpo; responde com os anexos', async () => {
    const requests: Request[] = []
    const client = createDriverClient(
      [
        Response.json(
          { data: { expiresAt: 'x', uploadId: 'upload-9', uploadUrl: 'https://s3.test/t' } },
          { status: 201 },
        ),
        Response.json({ data: {} }, { status: 201 }),
      ],
      requests,
    )

    const upload = await client.requestUpload({
      contentType: 'image/jpeg',
      fileName: 'canhoto.jpg',
      occurrenceId: 'occurrence-1',
      sizeBytes: 12,
    })
    await client.reply({
      attachmentIds: [upload.uploadId],
      body: '',
      idempotencyKey: 'driver-message:1',
      occurrenceId: 'occurrence-1',
    })

    expect(requests[0]?.url).toBe(`${API_URL}/me/trips/current/occurrences/occurrence-1/uploads`)
    expect(await requests[0]?.json()).toEqual({
      contentType: 'image/jpeg',
      fileName: 'canhoto.jpg',
      sizeBytes: 12,
    })
    expect(await requests[1]?.json()).toEqual({ attachmentIds: ['upload-9'], body: '' })
  })

  test('as mensagens trazem os anexos; sem o campo, lista vazia', async () => {
    const client = createDriverClient(
      [
        Response.json({
          data: [
            {
              attachments: [
                {
                  contentType: 'application/pdf',
                  fileName: 'comprovante.pdf',
                  id: 'attachment-1',
                  sizeBytes: 50,
                  url: 'https://s3.test/token',
                },
              ],
              authorName: 'Operadora Lima',
              bodyText: '',
              createdAt: '2026-09-25T12:00:00.000Z',
              direction: 'outbound',
              id: 'message-1',
              status: 'queued',
            },
            {
              authorName: null,
              bodyText: 'Ok',
              createdAt: '2026-09-25T12:01:00.000Z',
              direction: 'inbound',
              id: 'message-2',
              status: null,
            },
          ],
        }),
      ],
      [],
    )

    const messages = await client.listMessages('occurrence-1')

    expect(messages.map((message) => message.attachments.map((item) => item.fileName))).toEqual([
      ['comprovante.pdf'],
      [],
    ])
  })
})
