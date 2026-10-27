/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 RF1/RF5 (T5): os e-mails do cliente de entrega na tela. O cliente HTTP bate nas rotas da T2 com o `taxId`
 * codificado e nunca manda endereço fora do POST; a leitura recusa item malformado; o agrupamento segue o
 * vocabulário (boleto primeiro) e a conferência do endereço espelha a guarda da API.
 */
import { describe, expect, test } from 'bun:test'

import type { DeliveryClientEmail } from '../../src/modules/delivery-clients/shared/deliveryClientEmails.types'
import { createDeliveryClientEmailsClient } from '../../src/modules/delivery-clients/shared/deliveryClientEmailsClient.service'
import {
  deliveryClientEmailsFromApi,
  groupDeliveryClientEmailsByPurpose,
  validateDeliveryClientEmailDraft,
} from '../../src/modules/delivery-clients/shared/deliveryClientEmails.validation'

const EMAIL: DeliveryClientEmail = {
  addressMasked: 'f***@m***.example.test',
  createdAt: '2026-10-26T20:00:00.000Z',
  createdByKind: 'office',
  id: '0b5f4a6e-7a0f-4b3c-9c1e-2f6d7f8a9b10',
  label: 'financeiro',
  purpose: 'boleto',
}

function capture(respond: () => Response) {
  const requests: Array<{ body: unknown; method: string; url: string }> = []
  const client = createDeliveryClientEmailsClient({
    apiUrl: 'https://api.example.test',
    fetch: async (input) => {
      const request = input as Request
      const text = await request.clone().text()
      requests.push({
        body: text === '' ? undefined : JSON.parse(text),
        method: request.method,
        url: request.url,
      })
      return respond()
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { client, requests }
}

describe('e-mails do cliente — cliente HTTP (spec 279 RF1)', () => {
  test('lista, inclui, troca o rótulo e remove nas rotas do cadastro', async () => {
    const list = capture(() => Response.json({ data: [EMAIL] }))
    expect(await list.client.listEmails('12.345.678/0001-90')).toEqual([EMAIL])
    expect(list.requests[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.example.test/delivery-clients/12.345.678%2F0001-90/emails',
    })

    const add = capture(() => Response.json({ data: EMAIL }, { status: 201 }))
    await add.client.addEmail({
      body: { address: 'fin@mercado.example.test', label: 'financeiro', purpose: 'boleto' },
      taxId: '123',
    })
    expect(add.requests[0]).toMatchObject({
      body: { address: 'fin@mercado.example.test', label: 'financeiro', purpose: 'boleto' },
      method: 'POST',
    })

    const patch = capture(() => Response.json({ data: EMAIL }))
    await patch.client.updateLabel({ emailId: EMAIL.id, label: 'dono', taxId: '123' })
    expect(patch.requests[0]).toMatchObject({
      body: { label: 'dono' },
      method: 'PATCH',
      url: `https://api.example.test/delivery-clients/123/emails/${EMAIL.id}`,
    })

    const remove = capture(() => new Response(null, { status: 204 }))
    await remove.client.removeEmail({ emailId: EMAIL.id, taxId: '123' })
    expect(remove.requests[0]).toMatchObject({ method: 'DELETE' })
  })

  test('a recusa da API chega pelo código (limite de 10)', async () => {
    const { client } = capture(() =>
      Response.json({ error: { code: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED' } }, { status: 422 }),
    )
    const failure = await client
      .addEmail({ body: { address: 'a@b.co', label: '', purpose: 'boleto' }, taxId: '1' })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({ message: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED' })
  })

  test('resposta malformada vira erro, nunca lista pela metade', () => {
    expect(() => deliveryClientEmailsFromApi({ data: [EMAIL, { id: 'x' }] })).toThrow()
    expect(() => deliveryClientEmailsFromApi({ data: [{ ...EMAIL, purpose: 'other' }] })).toThrow()
    expect(() => deliveryClientEmailsFromApi({})).toThrow()
  })
})

describe('e-mails do cliente — agrupamento e conferência (spec 279 RF5)', () => {
  test('agrupa por tipo na ordem do vocabulário e omite tipo vazio', () => {
    const groups = groupDeliveryClientEmailsByPurpose([
      { ...EMAIL, id: 'a', purpose: 'general' } as never,
      { ...EMAIL, id: 'b', purpose: 'boleto' } as never,
      { ...EMAIL, id: 'c', purpose: 'boleto' } as never,
    ])
    expect(groups.map((group) => [group.purpose, group.emails.length])).toEqual([
      ['boleto', 2],
      ['general', 1],
    ])
  })

  test.each([
    ['vazio', ''],
    ['dois endereços', 'a@b.com,c@d.com'],
    ['quebra de linha', 'x@y.com\nBcc: z@w.com'],
    ['sem arroba', 'fulano.empresa.com'],
    ['passa de 254', `${'a'.repeat(250)}@b.com`],
  ])('endereço inválido: %s', (_name, address) => {
    expect(
      validateDeliveryClientEmailDraft({ address, label: '', purpose: 'boleto' }).address,
    ).toBe('addressInvalid')
  })

  test('endereço válido e rótulo no limite passam; rótulo acima de 60 não', () => {
    expect(
      validateDeliveryClientEmailDraft({
        address: 'fin@mercado.example.test',
        label: 'x'.repeat(60),
        purpose: 'boleto',
      }),
    ).toEqual({})
    expect(
      validateDeliveryClientEmailDraft({
        address: 'fin@mercado.example.test',
        label: 'x'.repeat(61),
        purpose: 'boleto',
      }).label,
    ).toBe('labelTooLong')
  })
})
