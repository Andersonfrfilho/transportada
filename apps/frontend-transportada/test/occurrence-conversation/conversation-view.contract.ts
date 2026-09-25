/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407 (P4, RF14, RF16): a aba Contratante lê a conversa por serviço puro — de que lado
 * fica o balão, quem escreveu (o contato do cadastro, ou "fora dos contatos" com a sugestão), o selo
 * de status que o e-mail consegue dar e o dia de cada grupo. O diálogo "Enviar à contratante" monta o
 * pedido e confere o rascunho antes de a API conferir de novo.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildContractorMailRequest,
  createDriverMessageIdempotencyKey,
  createOccurrenceMailIdempotencyKey,
  describeConversationMessage,
  groupConversationByDay,
  initialRecipientIds,
  validateContractorMailDraft,
  validateDriverMessageDraft,
} from '@/modules/occurrence-conversation/shared/occurrenceConversation.service'
import type { OccurrenceConversationMessage } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

const CONTACT = {
  contractorId: 'contractor-1',
  email: 'compras@alfa.example.test',
  id: 'contact-1',
  name: 'Maria Souza',
  phone: null,
  preferredChannel: 'email',
  roleLabel: 'Compras',
  status: 'active',
  types: ['occurrences', 'approves_charges'],
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
    createdAt: '2026-09-24T12:00:00.000Z',
    direction: 'outbound',
    id: 'message-1',
    status: 'sent',
    statusTimes: { queued: '2026-09-24T12:00:00.000Z', sent: '2026-09-24T12:00:05.000Z' },
    ...overrides,
  }
}

describe('a mensagem da conversa (spec 183 T407)', () => {
  test('a enviada fica do nosso lado, com o nome de quem escreveu e o status do e-mail', () => {
    expect(describeConversationMessage(message())).toEqual({
      author: { kind: 'operation', name: 'Operadora Lima' },
      side: 'mine',
      status: { at: '2026-09-24T12:00:05.000Z', value: 'sent' },
      tone: 'outbound',
    })
  })

  test('na fila não tem tique; devolvido e falho saem como falha, com o horário', () => {
    expect(describeConversationMessage(message({ status: 'queued' })).status).toEqual({
      at: '2026-09-24T12:00:00.000Z',
      value: 'queued',
    })
    expect(
      describeConversationMessage(
        message({ status: 'bounced', statusTimes: { bounced: '2026-09-24T12:01:00.000Z' } }),
      ).status,
    ).toEqual({ at: '2026-09-24T12:01:00.000Z', value: 'bounced' })
  })

  test('a recebida do contato mostra nome, setor, "aprova cobranças" e o endereço como chegou', () => {
    const view = describeConversationMessage(
      message({
        author: {
          identity: {
            arrivedAs: 'Compras@Alfa.example.test',
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
        statusTimes: {},
      }),
    )
    expect(view).toEqual({
      author: {
        approvesCharges: true,
        arrivedAs: 'Compras@Alfa.example.test',
        contact: CONTACT,
        inactive: false,
        kind: 'contact',
        name: 'Maria Souza',
        roleLabel: 'Compras',
      },
      side: 'theirs',
      status: null,
      tone: 'contractor',
    })
  })

  test('contato sem nome aparece pelo e-mail do cadastro', () => {
    const view = describeConversationMessage(
      message({
        author: {
          identity: {
            arrivedAs: 'compras@alfa.example.test',
            contact: { ...CONTACT, name: '' },
            inactive: true,
            kind: 'contact',
            profileName: null,
          },
          kind: 'contractor',
          userId: null,
        },
        direction: 'inbound',
        status: null,
      }),
    )
    expect(view.author).toMatchObject({ inactive: true, name: 'compras@alfa.example.test' })
  })

  test('fora dos contatos: o nome do From (ou o endereço) e a sugestão de cadastro', () => {
    const view = describeConversationMessage(
      message({
        author: {
          identity: {
            arrivedAs: 'joao@alfa.example.test',
            displayName: 'João Lima',
            kind: 'unknown',
            suggestion: { email: 'joao@alfa.example.test', name: 'João Lima', phone: null },
          },
          kind: 'contractor',
          userId: null,
        },
        direction: 'inbound',
        status: null,
      }),
    )
    expect(view.author).toEqual({
      arrivedAs: 'joao@alfa.example.test',
      kind: 'unknown',
      name: 'João Lima',
      suggestion: { email: 'joao@alfa.example.test', name: 'João Lima', phone: null },
    })
  })
})

describe('os dias da conversa', () => {
  test('agrupa por dia local, na ordem das mensagens', () => {
    const groups = groupConversationByDay(
      [
        message({ createdAt: '2026-09-23T12:00:00.000Z', id: 'a' }),
        message({ createdAt: '2026-09-24T09:00:00.000Z', id: 'b' }),
        message({ createdAt: '2026-09-24T18:00:00.000Z', id: 'c' }),
      ],
      (value) => value.slice(0, 10),
    )
    expect(groups.map((group) => [group.day, group.messages.map((item) => item.id)])).toEqual([
      ['2026-09-23', ['a']],
      ['2026-09-24', ['b', 'c']],
    ])
  })
})

describe('o diálogo "Enviar à contratante"', () => {
  const RECIPIENTS = [
    {
      approvesCharges: true,
      contactId: 'contact-1',
      email: 'compras@alfa.example.test',
      name: 'Maria Souza',
      preselected: true,
      roleLabel: 'Compras',
    },
    {
      approvesCharges: false,
      contactId: 'contact-2',
      email: 'expedicao@alfa.example.test',
      name: '',
      preselected: false,
      roleLabel: '',
    },
  ] as const

  test('abre com os contatos do grupo da ocorrência marcados', () => {
    expect(initialRecipientIds(RECIPIENTS)).toEqual(['contact-1'])
  })

  test('sem destinatário, assunto ou mensagem, diz o que falta; espaço não conta', () => {
    expect(validateContractorMailDraft({ body: '  ', contactIds: [], subject: '' })).toEqual({
      body: 'required',
      recipients: 'required',
      subject: 'required',
    })
    expect(
      validateContractorMailDraft({ body: 'Texto', contactIds: ['contact-1'], subject: 'Assunto' }),
    ).toEqual({})
  })

  test('o pedido vai pelo canal e-mail, com o texto aparado', () => {
    expect(
      buildContractorMailRequest({
        body: '  Texto  ',
        contactIds: ['contact-1'],
        subject: ' Assunto ',
      }),
    ).toEqual({ body: 'Texto', channel: 'email', contactIds: ['contact-1'], subject: 'Assunto' })
  })

  test('a chave de idempotência cabe no formato da API', () => {
    const key = createOccurrenceMailIdempotencyKey(() => '0f8e1c2a-7b3d-4e5f-9a6b-1c2d3e4f5a6b')
    expect(key).toMatch(/^[A-Za-z0-9._:-]{16,256}$/u)
    expect(key).toBe('occurrence-mail:0f8e1c2a-7b3d-4e5f-9a6b-1c2d3e4f5a6b')
  })
})

describe('a mensagem ao motorista (spec 183 T603)', () => {
  test('texto aparado; vazio ou longo demais diz o que falta', () => {
    expect(validateDriverMessageDraft('  Pode aguardar?  ')).toEqual({ body: 'Pode aguardar?' })
    expect(validateDriverMessageDraft('   ')).toEqual({ error: 'required' })
    expect(validateDriverMessageDraft('x'.repeat(8001))).toEqual({ error: 'tooLong' })
  })

  test('a mensagem do motorista fica do lado dele, no tom do motorista', () => {
    expect(
      describeConversationMessage(
        message({
          author: { kind: 'driver', name: 'Motorista Sintético', userId: 'driver-user' },
          channel: 'app',
          direction: 'inbound',
          status: null,
          statusTimes: {},
        }),
      ),
    ).toEqual({
      author: { kind: 'driver', name: 'Motorista Sintético' },
      side: 'theirs',
      status: null,
      tone: 'driver',
    })
  })

  test('a chave da mensagem ao motorista cabe no formato da API', () => {
    expect(createDriverMessageIdempotencyKey(() => '0f8e1c2a-7b3d-4e5f-9a6b-1c2d3e4f5a6b')).toBe(
      'driver-message:0f8e1c2a-7b3d-4e5f-9a6b-1c2d3e4f5a6b',
    )
  })
})
