/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O fio da ocorrência é o `ConversationThread` do SDK (visão `operator`), o mesmo desenho do app do motorista e da
 * conversa por assunto. Prende o adaptador (lado, nome com canal, envio com a chave do SDK, leitura pelo cache da
 * aba, marcar como lida só com mensagem nova) e o texto de fonte das telas: sem balão, `<audio>`, `<svg>` nem
 * compositor próprios, e as funções antigas (ações por anexo, remetente, reenvio) nas faixas ao lado do fio.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { describe, expect, mock, test } from 'bun:test'

import type {
  OccurrenceConversation,
  OccurrenceConversationMessage,
  OccurrenceConversationsView,
} from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'
import {
  createOccurrenceThreadApi,
  toThreadMessage,
  type OccurrenceThreadAuthorLabels,
  type OccurrenceThreadClient,
} from '@/modules/occurrence-conversation/shared/occurrenceThreadApi.service'

const LABELS: OccurrenceThreadAuthorLabels = {
  automatic: 'Aviso automático',
  channel: {
    app: 'via App',
    email: 'via E-mail',
    portal: 'via Portal',
    whatsapp: 'via WhatsApp',
  },
  contractor: 'Contratante',
  contractorUser: 'Usuário da contratante',
  copy: 'Cópia',
  driver: 'Motorista',
  operation: 'Operação',
  team: 'Equipe',
  teamOnly: 'só para a equipe — a contratante não recebeu',
  unverified: 'Remetente não confirmado',
}

const CONTACT = {
  contractorId: 'contractor-1',
  email: 'compras@alfa.example.test',
  id: 'contact-1',
  name: 'Maria Souza',
  phone: null,
  preferredChannel: 'email',
  roleLabel: 'Compras',
  status: 'active',
  types: ['occurrences'],
  whatsappOptInAt: null,
} as const

function message(
  overrides: Partial<OccurrenceConversationMessage> = {},
): OccurrenceConversationMessage {
  return {
    attachments: [],
    author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-1' },
    bodyText: 'Autorizam a descarga?',
    channel: 'email',
    createdAt: '2026-10-12T12:00:00.000Z',
    direction: 'outbound',
    id: 'message-1',
    status: 'sent',
    statusTimes: {},
    ...overrides,
  }
}

const BOLETO = {
  contentType: 'application/pdf',
  fileName: 'boleto.pdf',
  id: 'att-1',
  sizeBytes: 2048,
  url: 'https://s.test/att-1',
} as const

function conversation(
  participant: OccurrenceConversation['participant'],
  overrides: Partial<OccurrenceConversation> = {},
): OccurrenceConversation {
  return {
    id: `conversation-${participant}`,
    messages: [],
    participant,
    status: 'open',
    unreadCount: 0,
    ...overrides,
  }
}

function createFakeClient() {
  const calls = {
    chat: [] as unknown[],
    driver: [] as unknown[],
    markRead: [] as unknown[],
    portal: [] as unknown[],
    uploads: [] as unknown[],
  }
  const client: OccurrenceThreadClient = {
    markConversationRead: (input) => {
      calls.markRead.push(input)
      return Promise.resolve()
    },
    putConversationUpload: () => Promise.resolve(),
    requestConversationUpload: (input) => {
      calls.uploads.push(input)
      return Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://s.test/u' })
    },
    sendContractorChatMessage: (input) => {
      calls.chat.push(input)
      return Promise.resolve()
    },
    sendDriverAppMessage: (input) => {
      calls.driver.push(input)
      return Promise.resolve()
    },
  }
  return { calls, client }
}

function createApi(input: {
  conversations: readonly OccurrenceConversation[]
  participant: 'contractor' | 'driver'
}) {
  const { calls, client } = createFakeClient()
  const onChanged = mock(() => undefined)
  const view: OccurrenceConversationsView = {
    contractorPortal: { available: true },
    conversations: input.conversations,
  }
  const api = createOccurrenceThreadApi({
    client,
    labels: LABELS,
    occurrenceId: 'occurrence-1',
    onChanged,
    participant: input.participant,
    readConversations: () => Promise.resolve(view),
    subscribe: () => () => undefined,
  })
  return { api, calls, onChanged }
}

const SUBJECT = { subjectId: 'occurrence-1:contractor', subjectType: 'trip_occurrence' }

describe('o mapa da mensagem da ocorrência para o SDK', () => {
  test('o que o operador escreveu é outbound; o canal e o cargo vão no nome; o estado passa sem tradução', () => {
    const sent = toThreadMessage(message({ status: 'delivered' }), LABELS)
    expect(sent).toMatchObject({
      authorName: 'Operadora Lima · via E-mail',
      direction: 'outbound',
      status: 'delivered',
      text: 'Autorizam a descarga?',
    })
    const received = toThreadMessage(
      message({
        author: {
          identity: {
            arrivedAs: 'maria@alfa.example.test',
            contact: CONTACT,
            inactive: false,
            kind: 'contact',
            profileName: null,
          },
          kind: 'contractor',
          userId: null,
        },
        direction: 'inbound',
        status: null,
      }),
      LABELS,
    )
    /** Só o nome de quem respondeu: sem cargo, sem e-mail. */
    expect(received).toMatchObject({ authorName: 'Maria Souza · via E-mail', direction: 'inbound' })
    expect(received).not.toHaveProperty('status')
  })

  test('remetente fora dos contatos diz "Remetente não confirmado" quando o DKIM não alinhou, senão "Fora dos contatos"', () => {
    const unknown = (unverified: boolean) =>
      message({
        author: {
          identity: {
            arrivedAs: 'compras@alfa.example.test',
            displayName: 'Compras Alfa',
            kind: 'unknown',
            suggestion: { email: 'compras@alfa.example.test', name: 'Compras Alfa', phone: null },
            unverified,
          },
          kind: 'contractor',
          userId: null,
        },
        direction: 'inbound',
        status: null,
      })
    expect(toThreadMessage(unknown(true), LABELS).authorName).toBe(
      'Compras Alfa · Remetente não confirmado · via E-mail',
    )
    expect(toThreadMessage(unknown(false), LABELS).authorName).toBe('Compras Alfa · via E-mail')
  })

  test('sem nome legível (vazio, ou o próprio endereço) cai em "Contratante"; o endereço nunca aparece', () => {
    const withName = (displayName: null | string) =>
      toThreadMessage(
        message({
          author: {
            identity: {
              arrivedAs: 'compras@alfa.example.test',
              displayName,
              kind: 'unknown',
              suggestion: { email: 'compras@alfa.example.test', name: '', phone: null },
            },
            kind: 'contractor',
            userId: null,
          },
          direction: 'inbound',
          status: null,
        }),
        LABELS,
      ).authorName
    expect(withName(null)).toBe('Contratante · via E-mail')
    expect(withName('  ')).toBe('Contratante · via E-mail')
    expect(withName('compras@alfa.example.test')).toBe('Contratante · via E-mail')
    expect(withName('Compras Alfa')).not.toContain('@')
  })

  /** Spec 267 RF8/RF9: a cópia aparece no histórico; o responsável que respondeu é da equipe, com o selo quando a contratante não recebeu. */
  test('a mensagem de saída mostra "Cópia:" e a resposta do responsável é da equipe, com o selo se a contratante não recebeu', () => {
    const withCopy = toThreadMessage(
      message({
        copy: [
          { maskedEmail: 'a***@e***.test', name: 'Ana' },
          { maskedEmail: 'b***@e***.test', name: null },
        ],
      }),
      LABELS,
    )
    expect(withCopy.text).toBe('Cópia: Ana, b***@e***.test\n\nAutorizam a descarga?')
    expect(toThreadMessage(message(), LABELS).text).toBe('Autorizam a descarga?')

    const internal = (reachedContractor: boolean) =>
      toThreadMessage(
        message({
          author: {
            identity: {
              arrivedAs: 'ana@empresa.test',
              kind: 'internal',
              name: 'Ana',
              reachedContractor,
              userId: 'user-ana',
            },
            kind: 'contractor',
            userId: null,
          },
          direction: 'inbound',
          status: null,
        }),
        LABELS,
      ).authorName
    expect(internal(true)).toBe('Ana · Equipe · via E-mail')
    expect(internal(false)).toBe(
      'Ana · Equipe · só para a equipe — a contratante não recebeu · via E-mail',
    )
  })

  test('o aviso automático e o motorista têm nome; o anexo vira o formato do SDK', () => {
    expect(
      toThreadMessage(message({ author: { kind: 'automatic' }, channel: 'portal' }), LABELS)
        .authorName,
    ).toBe('Aviso automático · via Portal')
    const driver = toThreadMessage(
      message({
        attachments: [BOLETO],
        author: { kind: 'driver', name: 'Marcos S.', userId: 'user-2' },
        channel: 'app',
        direction: 'inbound',
        status: null,
      }),
      LABELS,
    )
    expect(driver.authorName).toBe('Marcos S. · via App')
    expect(driver.attachments[0]).toEqual({
      filename: 'boleto.pdf',
      id: 'att-1',
      kind: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    })
  })
})

describe('o adaptador do fio da ocorrência', () => {
  test('lê a conversa da aba (a do motorista não vaza para a da contratante) e resolve a URL do anexo', async () => {
    const { api } = createApi({
      conversations: [
        conversation('contractor', { messages: [message({ id: 'for-contractor' })] }),
        conversation('driver', {
          messages: [message({ attachments: [BOLETO], id: 'for-driver' })],
        }),
      ],
      participant: 'driver',
    })
    const messages = await api.fetchMessages(SUBJECT)
    expect(messages.map((item) => item.id)).toEqual(['for-driver'])
    expect(await api.fetchMessages(SUBJECT, { before: 'x' })).toEqual([])
    const [first] = messages
    const attachment = first?.attachments[0]
    expect(attachment).toBeDefined()
    if (attachment === undefined) return
    expect(await api.resolveAttachmentUrl(attachment)).toBe('https://s.test/att-1')
  })

  test('aba sem conversa ainda devolve fio vazio, nunca erro', async () => {
    const { api } = createApi({ conversations: [], participant: 'contractor' })
    expect(await api.fetchMessages(SUBJECT)).toEqual([])
  })

  test('motorista: envia pelo app com a chave do SDK, sobe o anexo pelo canal app e manda reler', async () => {
    const { api, calls, onChanged } = createApi({ conversations: [], participant: 'driver' })
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const result = await api.sendMessage({
      clientMessageId: 'client-1',
      files: [file],
      subject: SUBJECT,
      text: 'Pode seguir.',
    })
    expect(result.outcome).toBe('sent')
    expect(calls.driver).toEqual([
      {
        attachmentIds: ['upload-1'],
        body: 'Pode seguir.',
        idempotencyKey: 'driver-message:client-1',
        occurrenceId: 'occurrence-1',
      },
    ])
    expect(calls.uploads[0]).toMatchObject({ channel: 'app', participant: 'driver' })
    expect(calls.portal).toEqual([])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  test('contratante: envia o chat por e-mail (chave email-message, otimista queued), nunca portal nem app', async () => {
    const { api, calls } = createApi({ conversations: [], participant: 'contractor' })
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const result = await api.sendMessage({
      clientMessageId: 'client-2',
      files: [file],
      subject: SUBJECT,
      text: 'Bom dia.',
    })
    expect(calls.chat).toEqual([
      {
        attachmentIds: ['upload-1'],
        body: 'Bom dia.',
        idempotencyKey: 'email-message:client-2',
        occurrenceId: 'occurrence-1',
      },
    ])
    expect(calls.uploads[0]).toMatchObject({ channel: 'email', participant: 'contractor' })
    expect(result.outcome === 'sent' && result.message.status).toBe('queued')
    expect(calls.portal).toEqual([])
    expect(calls.driver).toEqual([])
  })

  test('marcar como lida só com mensagem nova do outro lado, e uma vez', async () => {
    const { api, calls, onChanged } = createApi({
      conversations: [conversation('contractor', { unreadCount: 2 })],
      participant: 'contractor',
    })
    await api.markRead?.(SUBJECT)
    expect(calls.markRead).toEqual([]) // antes de ler a conversa, não há o que marcar
    await api.fetchMessages(SUBJECT)
    await api.markRead?.(SUBJECT)
    await api.markRead?.(SUBJECT)
    expect(calls.markRead).toEqual([{ conversationId: 'conversation-contractor' }])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})

const MODULE = 'src/modules/occurrence-conversation/'

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${MODULE}${path}`, import.meta.url), 'utf8')
}

describe('as telas da ocorrência (texto de fonte)', () => {
  test('o fio é o ConversationThread do SDK na visão do escritório, sem compositor nem balão próprios', async () => {
    const thread = await source('components/OccurrenceThread.component.tsx')
    expect(thread).toContain("from '@adatechnology/conversations-ui/participant'")
    expect(thread).toContain('perspective="operator"')
    expect(thread).toContain('audioRecording={SUBJECT_AUDIO_RECORDING_OPTIONS}')
    expect(thread).toContain('quickReplies={threadQuickReplies}')
    expect(thread).toContain('headerActions')
    expect(
      existsSync(
        new URL(`../../${MODULE}components/ConversationMessage.component.tsx`, import.meta.url),
      ),
    ).toBe(false)
  })

  test('as duas abas usam o mesmo fio', async () => {
    const screen = await source('components/OccurrenceConversations.component.tsx')
    expect(screen).toContain('participant="contractor"')
    expect(screen).toContain('participant="driver"')
    expect(screen.match(/<OccurrenceThread\b/gu)).toHaveLength(2)
  })

  test('nada de <audio>, <svg>, <textarea>, <form> nem estilo inline nas peças do fio', async () => {
    for (const file of [
      'components/OccurrenceConversations.component.tsx',
      'components/OccurrenceThread.component.tsx',
      'components/OccurrenceThreadAttachments.component.tsx',
      'components/OccurrenceThreadFailures.component.tsx',
      'components/OccurrenceThreadSenders.component.tsx',
    ]) {
      const text = await source(file)
      expect(text).not.toMatch(/<audio|<svg|<textarea|<form|style=\{\{|export default/u)
      expect(text).toContain('Copyright (c) 2026 Ada Technology')
    }
  })

  test('as funções de antes seguem na tela: ações por anexo, adicionar aos contatos, reenvio por canal', async () => {
    const screen = await source('components/OccurrenceConversations.component.tsx')
    expect(screen).toContain('<SendToDriverAction')
    expect(screen).toContain('<ContractorReplyEmailActions')
    expect(screen).toContain('<ForwardToContractorAction')
    expect(screen).toContain('<AddContractorContactAction')
    expect(screen).toContain('<OccurrenceThreadFailures')
    expect(screen).toContain('<OccurrenceThreadSenders')
    expect(screen).toContain('<OccurrenceThreadAttachments')
    const failures = await source('components/OccurrenceThreadFailures.component.tsx')
    expect(failures).toContain('resendChannelFor')
    expect(failures).toContain('isForwardAlreadyDone(send.error)')
  })

  test('as faixas dizem o estado em ícone + palavra + cor e têm alvo de toque', async () => {
    for (const file of [
      'components/OccurrenceThreadFailures.component.tsx',
      'components/OccurrenceThreadSenders.component.tsx',
      'components/OccurrenceThreadAttachments.component.tsx',
    ]) {
      expect(await source(file)).toContain('<Icon name=')
    }
    const css = await source('styles/occurrenceThread.module.css')
    expect(css).toContain('.noticeAlert')
    expect(css).toContain('var(--touch-target)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
