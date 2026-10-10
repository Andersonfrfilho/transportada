/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 263 T5.2-B (D10): o adaptador do `ConversationThread` sobre as rotas do escritório por assunto.
 * Prende o mapa de mensagens (empresa = outbound), o envio com a chave do painel, a leitura pela rota
 * existente e os rótulos/tema do fio.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, mock, test } from 'bun:test'

import type { SubjectConversationClient } from '@/modules/occurrence-conversation/shared/subjectConversationClient.service'
import type { OccurrenceConversationMessage } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'
import { createSubjectThreadApi } from '@/modules/occurrence-conversation/shared/subjectThreadApi.service'
import {
  buildSubjectThreadLabels,
  SUBJECT_THREAD_LABEL_KEYS,
} from '@/modules/occurrence-conversation/shared/subjectThreadLabels.service'
import { toThreadQuickReplies } from '@/modules/occurrence-conversation/shared/quickReplies.service'

const SUBJECT = { subjectId: 'doc-1', subjectType: 'document', tripId: 'trip-1' } as const
const REF = { subjectId: 'doc-1', subjectType: 'document' }

function message(overrides: Partial<OccurrenceConversationMessage>): OccurrenceConversationMessage {
  return {
    attachments: [],
    author: { kind: 'operation', name: 'Operadora Lima', userId: '' },
    bodyText: 'Pode entregar amanhã?',
    channel: 'app',
    createdAt: '2026-10-09T12:00:00.000Z',
    direction: 'outbound',
    id: 'message-1',
    status: 'delivered',
    statusTimes: {},
    ...overrides,
  }
}

function createFakeClient(overrides: Partial<SubjectConversationClient> = {}) {
  const calls = { markRead: [] as unknown[], send: [] as unknown[] }
  const client: SubjectConversationClient = {
    closeConversation: () => Promise.reject(new Error('unused')),
    listConversations: () => Promise.resolve([]),
    listMessages: () =>
      Promise.resolve([
        message({}),
        message({
          attachments: [
            {
              contentType: 'image/jpeg',
              fileName: 'canhoto.jpg',
              id: 'att-1',
              sizeBytes: 10,
              url: 'https://s.test/att-1',
            },
          ],
          author: { kind: 'driver', name: 'Marcos S.', userId: '' },
          direction: 'inbound',
          id: 'message-2',
          status: null,
        }),
      ]),
    markRead: (input) => {
      calls.markRead.push(input)
      return Promise.resolve()
    },
    openConversation: () => Promise.reject(new Error('unused')),
    putUpload: () => Promise.resolve(),
    requestUpload: () => Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://s.test/u' }),
    sendMessage: (input) => {
      calls.send.push(input)
      return Promise.resolve(message({ id: 'server-1' }))
    },
    ...overrides,
  }
  return { calls, client }
}

describe('o adaptador do fio do escritório (spec 263 T5.2-B)', () => {
  test('mensagens: empresa é outbound, motorista é inbound, com nome, status e anexo no formato do SDK', async () => {
    const { client } = createFakeClient()
    const api = createSubjectThreadApi({ client, subject: SUBJECT })

    const messages = await api.fetchMessages(REF)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      authorName: 'Operadora Lima',
      direction: 'outbound',
      id: 'message-1',
      status: 'delivered',
      text: 'Pode entregar amanhã?',
    })
    expect(messages[1]).toMatchObject({
      attachments: [
        {
          filename: 'canhoto.jpg',
          id: 'att-1',
          kind: 'image',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        },
      ],
      authorName: 'Marcos S.',
      direction: 'inbound',
    })
    expect(messages[1]).not.toHaveProperty('status')
    expect(await api.resolveAttachmentUrl(messages[1]!.attachments[0]!)).toBe(
      'https://s.test/att-1',
    )
  })

  test('mensagens anteriores: a rota devolve tudo, então "antes de" é sempre vazio', async () => {
    const { client } = createFakeClient()
    const api = createSubjectThreadApi({ client, subject: SUBJECT })

    expect(await api.fetchMessages(REF, { before: 'message-1' })).toEqual([])
  })

  test('enviar: a chave é subject-message:<clientMessageId> e o corpo vai com o par do assunto', async () => {
    const { calls, client } = createFakeClient()
    const api = createSubjectThreadApi({ client, subject: SUBJECT })

    const result = await api.sendMessage({
      clientMessageId: '5f1e1e0e-0000-4000-8000-000000000000',
      subject: REF,
      text: 'Pode descarregar na doca 2.',
    })

    expect(calls.send).toEqual([
      {
        ...SUBJECT,
        attachmentIds: [],
        body: 'Pode descarregar na doca 2.',
        idempotencyKey: 'subject-message:5f1e1e0e-0000-4000-8000-000000000000',
      },
    ])
    expect(result).toMatchObject({
      message: { clientMessageId: '5f1e1e0e-0000-4000-8000-000000000000', id: 'server-1' },
      outcome: 'sent',
    })
  })

  test('enviar com arquivo: sobe antes e manda os ids; o envio que falha repete a mesma chave', async () => {
    let attempts = 0
    const requestUpload = mock(() =>
      Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://s.test/u' }),
    )
    const { calls, client } = createFakeClient({
      requestUpload,
      sendMessage: (input) => {
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('network'))
        calls.send.push(input)
        return Promise.resolve(null)
      },
    })
    const api = createSubjectThreadApi({ client, subject: SUBJECT })
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const input = { clientMessageId: 'client-message-0001', files: [file], subject: REF }

    const failure = await api.sendMessage(input).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    const retried = await api.sendMessage(input)

    expect(requestUpload).toHaveBeenCalledTimes(1)
    expect(calls.send).toMatchObject([
      { attachmentIds: ['upload-1'], idempotencyKey: 'subject-message:client-message-0001' },
    ])
    expect(retried).toMatchObject({ message: { id: 'client-message-0001' }, outcome: 'sent' })
  })

  test('ler: markRead chama a rota de leitura do escritório do assunto', async () => {
    const { calls, client } = createFakeClient()
    const api = createSubjectThreadApi({ client, subject: SUBJECT })

    await Promise.resolve(api.markRead?.(REF))

    expect(calls.markRead).toEqual([SUBJECT])
  })

  test('as respostas do público viram chips do SDK; tocar preenche com o texto inteiro', () => {
    const text = 'Pode descarregar na doca 2, portão lateral, depois das 14h, com a nota em mãos.'
    const [chip] = toThreadQuickReplies([
      { active: true, audience: 'driver', id: 'qr-1', position: 1, text },
    ])

    expect(chip).toMatchObject({ body: text, id: 'qr-1', shortcut: 'reply-1' })
    expect(chip?.title.length).toBeLessThanOrEqual(40)
  })

  test('os rótulos: o aviso de encerrada é o do motivo e as demais chaves vêm do locale', async () => {
    const labels = buildSubjectThreadLabels((key) => `t:${key}`, 'Encerrada')
    expect(labels.closedNotice).toBe('Encerrada')
    expect(labels.send).toBe('t:thread.labels.send')
    const locale = JSON.parse(
      await readFile(
        new URL(
          '../../src/modules/occurrence-conversation/locales/subjectConversation.locale.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { thread: { labels: Record<string, string> } }
    for (const key of SUBJECT_THREAD_LABEL_KEYS) expect(locale.thread.labels[key]).toBeTruthy()
  })

  test('tema: os --cv-p-* apontam para tokens do painel, o destaque é opaco e os ticks têm cor própria', async () => {
    const css = await readFile(
      new URL(
        '../../src/modules/occurrence-conversation/styles/subjectConversation.module.css',
        import.meta.url,
      ),
      'utf8',
    )
    const theme = css.slice(
      css.indexOf('.conversationTheme'),
      css.indexOf('}', css.indexOf('.conversationTheme')),
    )
    expect(theme).toMatch(
      /--cv-p-highlight: color-mix\(in srgb, var\(--color-copper\) 12%, var\(--color-asphalt\)\)/u,
    )
    expect(theme).not.toMatch(/--cv-p-highlight:[^;]*(transparent|\/)/u)
    expect(theme).toMatch(/--cv-p-tick: /u)
    expect(theme).toMatch(/--cv-p-tick-read: /u)
    expect(theme).toMatch(/--cv-p-accent: var\(--color-copper-ink\)/u)
    expect(theme).toMatch(/--cv-p-radius: 0/u)
  })
})
