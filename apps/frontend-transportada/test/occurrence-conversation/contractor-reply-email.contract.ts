/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 248 RF9–RF11 (T4.7): levar o boleto da contratante por e-mail. O endereço digitado é um só (a mesma regra da
 * API), o botão do cliente da nota fica à vista com o motivo quando a nota não tem e-mail, e o cliente HTTP manda a
 * chave de idempotência no cabeçalho e o endereço só no alvo informado.
 */
import { describe, expect, test } from 'bun:test'

import {
  isContractorReplyBoletoAccepted,
  parseInformedAddress,
  readClientEmailSendOutcome,
  resolveClientEmailAction,
  readContractorReplyEmailOptions,
  readContractorReplyEmailOutcome,
  resolveEmailFailureKey,
  resolveInformedEmailAction,
  resolveNoteEmailAction,
  type ContractorReplyEmailOptions,
} from '../../src/modules/occurrence-conversation/shared/contractorReplyEmail.service'
import { createOccurrenceConversationClient } from '../../src/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const OPTIONS: ContractorReplyEmailOptions = {
  clientEmailType: 'off',
  clientEmails: [],
  deliveries: [],
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
  noteRecipient: { addressMasked: 'c***@d***.example.test', isAvailable: true },
  sentCount: 0,
  sentLimit: 5,
}

describe('o endereço informado é um só (spec 248 RF11)', () => {
  test.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['dois endereços', 'a@b.com,c@d.com'],
    ['ponto e vírgula', 'a@b.com;c@d.com'],
    ['cabeçalho Bcc', 'x@y.com\r\nBcc: z@w.com'],
    ['quebra de linha', 'x@y.com\nz@w.com'],
    ['nome com colchetes', 'Fulano <a@b.com>'],
    ['sem arroba', 'fulano.empresa.com'],
    ['dois espaços no meio', 'a b@c.com'],
    ['acima de 254', `${'a'.repeat(250)}@b.com`],
  ])('recusa %s', (_label, raw) => {
    expect(parseInformedAddress(raw)).toBeNull()
  })

  test('aceita um endereço e tira as bordas em branco', () => {
    expect(parseInformedAddress('  financeiro@cliente.com.br ')).toBe('financeiro@cliente.com.br')
  })
})

describe('quando cada botão é oferecido (spec 248 RF10)', () => {
  test('o do cliente da nota some com o modo desligado e aceita manual e automático', () => {
    expect(resolveNoteEmailAction({ ...OPTIONS, forwardToNoteRecipient: 'off' })).toEqual({
      kind: 'hidden',
    })
    expect(resolveNoteEmailAction(OPTIONS)).toEqual({ kind: 'enabled' })
    expect(resolveNoteEmailAction({ ...OPTIONS, forwardToNoteRecipient: 'automatic' })).toEqual({
      kind: 'enabled',
    })
  })

  test('nota sem e-mail: fica à vista, desligado e com o motivo; nunca habilitado', () => {
    expect(
      resolveNoteEmailAction({
        ...OPTIONS,
        noteRecipient: { addressMasked: null, isAvailable: false },
      }),
    ).toEqual({ kind: 'disabled', reason: 'noteWithoutEmail' })
  })

  test('o teto de cinco desliga os dois, com o motivo', () => {
    const full = { ...OPTIONS, sentCount: 5 }
    expect(resolveNoteEmailAction(full)).toEqual({ kind: 'disabled', reason: 'limitReached' })
    expect(resolveInformedEmailAction(full)).toEqual({ kind: 'disabled', reason: 'limitReached' })
    expect(resolveNoteEmailAction({ ...OPTIONS, sentCount: 4 })).toEqual({ kind: 'enabled' })
  })

  test('o do e-mail informado só aparece no modo manual', () => {
    expect(resolveInformedEmailAction({ ...OPTIONS, forwardToInformedEmail: 'off' })).toEqual({
      kind: 'hidden',
    })
    expect(resolveInformedEmailAction(OPTIONS)).toEqual({ kind: 'enabled' })
  })
})

describe('a leitura das opções é tolerante e de chaves conhecidas', () => {
  const payload = {
    data: {
      deliveries: [
        {
          addressMasked: 'c***@d***.example.test',
          createdAt: '2026-10-12T20:00:00.000Z',
          id: 'delivery-1',
          reason: null,
          status: 'queued',
          target: 'note_recipient_email',
        },
        { id: 'quebrada' },
      ],
      forwardToInformedEmail: 'manual',
      forwardToNoteRecipient: 'automatic',
      noteRecipient: { addressMasked: null, isAvailable: false },
      sentCount: 1,
      sentLimit: 5,
    },
  }

  test('lê a resposta e descarta só a entrega malformada', () => {
    const options = readContractorReplyEmailOptions(payload)
    expect(options?.forwardToNoteRecipient).toBe('automatic')
    expect(options?.noteRecipient).toEqual({ addressMasked: null, isAvailable: false })
    expect(options?.deliveries.map((delivery) => delivery.id)).toEqual(['delivery-1'])
  })

  test('sem retorno (data nulo) ou resposta fora do contrato: nenhum botão', () => {
    expect(readContractorReplyEmailOptions({ data: null })).toBeNull()
    expect(readContractorReplyEmailOptions({})).toBeNull()
    expect(
      readContractorReplyEmailOptions({
        data: { ...payload.data, forwardToNoteRecipient: 'sempre' },
      }),
    ).toBeNull()
  })

  test('o desfecho do envio: na fila, repetido, pulado e falho', () => {
    expect(
      readContractorReplyEmailOutcome({ data: { addressMasked: 'a***@b***.com', kind: 'queued' } }),
    ).toEqual({ addressMasked: 'a***@b***.com', kind: 'queued' })
    expect(readContractorReplyEmailOutcome({ data: { kind: 'already_queued' } })).toEqual({
      addressMasked: null,
      kind: 'already_queued',
    })
    expect(
      readContractorReplyEmailOutcome({
        data: { kind: 'skipped', reason: 'note_without_recipient_email' },
      }),
    ).toEqual({ kind: 'skipped', reason: 'note_without_recipient_email' })
    expect(() => readContractorReplyEmailOutcome({ data: { kind: 'x' } })).toThrow()
  })
})

describe('o texto do erro vem do código, nunca cru', () => {
  test('cada código estável tem a sua chave', () => {
    expect(resolveEmailFailureKey('CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID')).toBe('addressInvalid')
    expect(resolveEmailFailureKey('CONTRACTOR_REPLY_EMAIL_LIMIT_REACHED')).toBe('limitReached')
    expect(resolveEmailFailureKey('CONTRACTOR_REPLY_EMAIL_FORWARD_DISABLED')).toBe(
      'forwardDisabled',
    )
    expect(resolveEmailFailureKey('CONTRACTOR_MAIL_SENDING_NOT_VERIFIED')).toBe('mailNotReady')
    expect(resolveEmailFailureKey('CONTRACTOR_MAIL_NOT_CONFIGURED')).toBe('mailNotReady')
    expect(resolveEmailFailureKey('QUALQUER_OUTRO')).toBe('generic')
  })
})

describe('o cliente HTTP do envio por e-mail', () => {
  function capture(respond: () => Response) {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = []
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: async (request) => {
        const text = await request.clone().text()
        requests.push({
          body: text === '' ? undefined : JSON.parse(text),
          headers: request.headers,
          method: request.method,
          url: request.url,
        })
        return respond()
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    return { client, requests }
  }

  test('o alvo da nota vai sem endereço, com a chave no cabeçalho', async () => {
    const { client, requests } = capture(() =>
      Response.json({ data: { addressMasked: 'c***@d***.com', kind: 'queued' } }, { status: 201 }),
    )
    const outcome = await client.forwardContractorReplyByEmail({
      attachmentId: 'attachment-1',
      idempotencyKey: 'reply-email:abc',
      occurrenceId: 'occurrence-1',
      target: 'note_recipient_email',
    })
    expect(outcome.kind).toBe('queued')
    expect(requests[0]).toMatchObject({
      body: { attachmentId: 'attachment-1', target: 'note_recipient_email' },
      method: 'POST',
      url: 'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/email-delivery',
    })
    expect(requests[0]?.headers.get('idempotency-key')).toBe('reply-email:abc')
    expect(requests[0]?.body).not.toHaveProperty('address')
  })

  test('o alvo informado leva o endereço; a recusa chega pelo código da API', async () => {
    const { client, requests } = capture(() =>
      Response.json({ error: { code: 'CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID' } }, { status: 400 }),
    )
    const failure = await client
      .forwardContractorReplyByEmail({
        address: 'a@b.com',
        attachmentId: 'attachment-1',
        idempotencyKey: 'reply-email:def',
        occurrenceId: 'occurrence-1',
        target: 'informed_email',
      })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID' })
    expect(requests[0]?.body).toMatchObject({ address: 'a@b.com', target: 'informed_email' })
  })

  test('a leitura das opções é um GET na rota do retorno', async () => {
    const { client, requests } = capture(() => Response.json({ data: null }))
    expect(
      await client.readContractorReplyEmailOptions({ occurrenceId: 'occurrence-1' }),
    ).toBeNull()
    expect(requests[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/email-options',
    })
  })
})

describe('o envio ao cliente do cadastro (spec 279 T5)', () => {
  const WIRE = {
    clientEmailType: 'boleto',
    clientEmails: [{ addressMasked: 'f***@m***.com', emailId: 'e-1', label: 'financeiro' }],
    deliveries: [],
    forwardToInformedEmail: 'manual',
    forwardToNoteRecipient: 'manual',
    noteRecipient: { addressMasked: null, isAvailable: false },
    sentCount: 0,
    sentLimit: 5,
  }

  test('as opções trazem o tipo e os e-mails mascarados com o emailId', () => {
    const options = readContractorReplyEmailOptions({ data: WIRE })
    expect(options?.clientEmailType).toBe('boleto')
    expect(options?.clientEmails).toEqual(WIRE.clientEmails)
  })

  test('resposta sem os campos novos vira off e lista vazia: sem botão', () => {
    const legacy: Record<string, unknown> = { ...WIRE }
    delete legacy.clientEmailType
    delete legacy.clientEmails
    const options = readContractorReplyEmailOptions({ data: legacy })
    expect(options?.clientEmailType).toBe('off')
    expect(options?.clientEmails).toEqual([])
    expect(options && resolveClientEmailAction(options)).toEqual({ kind: 'hidden' })
  })

  test('off esconde; sem e-mail guardado vira Adicionar e-mail; com e-mail vira Enviar', () => {
    const base = readContractorReplyEmailOptions({ data: WIRE })
    if (base === null) throw new Error('OPTIONS_NULL')
    expect(resolveClientEmailAction({ ...base, clientEmailType: 'off' })).toEqual({
      kind: 'hidden',
    })
    expect(resolveClientEmailAction({ ...base, clientEmails: [] })).toEqual({ kind: 'add' })
    expect(resolveClientEmailAction(base)).toEqual({ kind: 'send' })
  })

  test('a entrega ao cliente do cadastro entra no histórico', () => {
    const options = readContractorReplyEmailOptions({
      data: {
        ...WIRE,
        deliveries: [
          {
            addressMasked: 'f***@m***.com',
            createdAt: '2026-10-26T20:00:00.000Z',
            id: 'd-1',
            reason: null,
            status: 'queued',
            target: 'client_boleto_emails',
          },
        ],
      },
    })
    expect(options?.deliveries).toHaveLength(1)
  })

  test('o resultado por endereço é lido; forma inesperada é erro, nunca enviado', () => {
    expect(
      readClientEmailSendOutcome({
        data: {
          results: [{ addressMasked: 'f***@m***.com', kind: 'queued', reason: null }],
          savedEmailId: 'e-9',
        },
      }),
    ).toEqual({
      results: [{ addressMasked: 'f***@m***.com', kind: 'queued', reason: null }],
      savedEmailId: 'e-9',
    })
    expect(() => readClientEmailSendOutcome({ data: { results: [{ kind: 'queued' }] } })).toThrow()
    expect(() => readClientEmailSendOutcome({})).toThrow()
  })

  test('a linha só oferece o botão com o boleto aceito', () => {
    expect(isContractorReplyBoletoAccepted('delivered')).toBe(true)
    expect(isContractorReplyBoletoAccepted('reply_received')).toBe(true)
    expect(isContractorReplyBoletoAccepted('awaiting_contractor')).toBe(false)
    expect(isContractorReplyBoletoAccepted('needs_operator')).toBe(false)
  })

  test('o cliente HTTP manda o alvo do cliente com emailIds, o novo endereço e save', async () => {
    const requests: Array<{ body: unknown; headers: Headers; url: string }> = []
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: async (request) => {
        requests.push({
          body: JSON.parse(await request.clone().text()),
          headers: request.headers,
          url: request.url,
        })
        return Response.json(
          {
            data: {
              results: [{ addressMasked: 'n***@x.com', kind: 'queued', reason: null }],
              savedEmailId: 'e-2',
            },
          },
          { status: 201 },
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    await client.forwardContractorReplyToClient({
      address: 'novo@x.com',
      emailIds: ['e-1'],
      idempotencyKey: 'client-email:abc',
      occurrenceId: 'occurrence-1',
      save: true,
    })
    expect(requests[0]?.body).toEqual({
      address: 'novo@x.com',
      emailIds: ['e-1'],
      save: true,
      target: 'client_boleto_emails',
    })
    expect(requests[0]?.headers.get('idempotency-key')).toBe('client-email:abc')
    expect(requests[0]?.url).toBe(
      'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/email-delivery',
    )
  })
})
