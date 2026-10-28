/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T8b (D13): o cliente das rotas de contatos do cliente da nota (lista mascarada, incluir, editar, remover), a
 * regra de quais canais o tipo pede, o mapa de erro da API e a tolerância do tipo da ocorrência aos campos novos.
 */
import { describe, expect, it } from 'bun:test'

import { toClientContactsErrorKey } from '../../src/modules/client-contacts/hooks/useClientContacts.hook'
import clientContactsEn from '../../src/modules/client-contacts/locales/clientContacts.en.locale.json'
import clientContactsPt from '../../src/modules/client-contacts/locales/clientContacts.locale.json'
import { createClientContactsApi } from '../../src/modules/client-contacts/shared/clientContactsApi.service'
import {
  parseClientEmail,
  resolveAskedContactChannels,
} from '../../src/modules/client-contacts/shared/clientContactsRule.service'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { isDriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTrip.types'

const DOCUMENT_ID = '0b9a4b8e-0000-4000-8000-000000000281'
const CONTACT_ID = '7d0c1a52-0000-4000-8000-000000000001'
const CONTACT = {
  addressMasked: '+55 (16) *****-1111',
  channel: 'whatsapp' as const,
  contactId: CONTACT_ID,
  editable: true,
  label: 'balcão',
}

function createApi(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const api = createClientContactsApi(
    createDriverConversationHttp({
      baseUrl: 'https://api.test',
      fetch: (request) => {
        requests.push(request.clone())
        return Promise.resolve(respond(request))
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
  )
  return { api, requests }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

describe('contatos do cliente na abertura da ocorrência (spec 281 T8b)', () => {
  it('lê a lista mascarada e descarta o item malformado', async () => {
    const { api, requests } = createApi(() =>
      json({ data: [CONTACT, { contactId: 'x' }, { ...CONTACT, channel: 'sms' }] }),
    )
    expect(await api.list(DOCUMENT_ID)).toEqual([CONTACT])
    expect(requests[0]?.method).toBe('GET')
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/me/trips/current/documents/${DOCUMENT_ID}/client-contacts`,
    )
  })

  it('inclui, edita e remove pelas rotas do documento', async () => {
    const { api, requests } = createApi((request) =>
      request.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ data: CONTACT }),
    )
    expect(
      await api.add({
        address: '+5516999991111',
        channel: 'whatsapp',
        documentId: DOCUMENT_ID,
        label: 'balcão',
      }),
    ).toEqual(CONTACT)
    await api.update({ contactId: CONTACT_ID, documentId: DOCUMENT_ID, label: 'recebimento' })
    await api.remove({ contactId: CONTACT_ID, documentId: DOCUMENT_ID })
    expect(requests.map((request) => request.method)).toEqual(['POST', 'PATCH', 'DELETE'])
    expect(await requests[0]?.json()).toEqual({
      address: '+5516999991111',
      channel: 'whatsapp',
      label: 'balcão',
    })
    expect(await requests[1]?.json()).toEqual({ label: 'recebimento' })
    expect(new URL(requests[2]?.url ?? '').pathname).toBe(
      `/me/trips/current/documents/${DOCUMENT_ID}/client-contacts/${CONTACT_ID}`,
    )
  })

  it('resposta inválida é recusada e o erro da API vira a frase da tela', async () => {
    const invalid = createApi(() => json({ data: 'x' }))
    const invalidError = await invalid.api.list(DOCUMENT_ID).then(
      () => undefined,
      (cause: unknown) => cause,
    )
    expect(invalidError).toBeInstanceOf(Error)
    const refused = createApi(() => json({ error: { code: 'X' } }, 422))
    const error = await refused.api
      .add({ address: 'a', channel: 'email', documentId: DOCUMENT_ID, label: '' })
      .then(
        () => undefined,
        (cause: unknown) => cause,
      )
    expect(toClientContactsErrorKey(error)).toBe('limit')
    expect(toClientContactsErrorKey(new DriverConversationRequestError('x', 400))).toBe('invalid')
    expect(toClientContactsErrorKey(new DriverConversationRequestError('x', 409))).toBe('duplicate')
    expect(toClientContactsErrorKey(new DriverConversationRequestError('x', 404))).toBe('notFound')
    expect(toClientContactsErrorKey(new DriverConversationRequestError('x'))).toBe('failed')
  })

  it('o tipo pede o contato só com o pedido ligado e o canal não desligado', () => {
    expect(resolveAskedContactChannels({})).toEqual([])
    expect(
      resolveAskedContactChannels({ asksClientContact: false, clientChannel: 'both' }),
    ).toEqual([])
    expect(resolveAskedContactChannels({ asksClientContact: true, clientChannel: 'off' })).toEqual(
      [],
    )
    expect(resolveAskedContactChannels({ asksClientContact: true })).toEqual(['email'])
    expect(
      resolveAskedContactChannels({ asksClientContact: true, clientChannel: 'whatsapp' }),
    ).toEqual(['whatsapp'])
    expect(resolveAskedContactChannels({ asksClientContact: true, clientChannel: 'both' })).toEqual(
      ['email', 'whatsapp'],
    )
  })

  it('o e-mail segue a guarda de forma do servidor', () => {
    expect(parseClientEmail(' nome@empresa.com.br ')).toBe('nome@empresa.com.br')
    expect(parseClientEmail('nome@empresa')).toBeNull()
    expect(parseClientEmail('a b@empresa.com')).toBeNull()
  })

  it('o tipo da ocorrência tolera os campos novos ausentes e recusa vocabulário estranho', () => {
    const base = { id: 't', name: 'Boleto' }
    expect(isDriverOccurrenceType(base)).toBe(true)
    expect(
      isDriverOccurrenceType({ ...base, asksClientContact: true, clientChannel: 'both' }),
    ).toBe(true)
    expect(isDriverOccurrenceType({ ...base, asksClientContact: 'sim' })).toBe(false)
    expect(isDriverOccurrenceType({ ...base, clientChannel: 'sms' })).toBe(false)
  })

  it('os dois idiomas têm as mesmas chaves', () => {
    const keys = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === 'object' && inner !== null
          ? keys(inner as object, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      )
    expect(keys(clientContactsEn).sort()).toEqual(keys(clientContactsPt).sort())
  })
})
