/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T8b: os números de WhatsApp do cliente de entrega na tela. O cliente HTTP bate nas rotas do cadastro com o
 * `taxId` codificado, a leitura recusa item malformado, a conferência do número espelha a guarda da API e os dois
 * idiomas têm as mesmas chaves.
 */
import { describe, expect, test } from 'bun:test'

import settingsEn from '../../src/modules/delivery-clients/locales/deliveryClients.en.locale.json'
import settingsPt from '../../src/modules/delivery-clients/locales/deliveryClients.locale.json'
import type { DeliveryClientWhatsApp } from '../../src/modules/delivery-clients/shared/deliveryClientWhatsApp.types'
import { createDeliveryClientWhatsAppClient } from '../../src/modules/delivery-clients/shared/deliveryClientWhatsAppClient.service'
import {
  deliveryClientWhatsAppListFromApi,
  isDeliveryClientWhatsAppNumberValid,
} from '../../src/modules/delivery-clients/shared/deliveryClientWhatsApp.validation'

const ITEM: DeliveryClientWhatsApp = {
  createdAt: '2026-10-27T20:00:00.000Z',
  createdByKind: 'office',
  id: '0b5f4a6e-7a0f-4b3c-9c1e-2f6d7f8a9b11',
  label: 'balcão',
  numberMasked: '+55 ••••1111',
}

function capture(respond: () => Response) {
  const requests: Array<{ body: unknown; method: string; url: string }> = []
  const client = createDeliveryClientWhatsAppClient({
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

describe('WhatsApp do cliente de entrega (spec 281 T8b)', () => {
  test('lista, inclui, edita e remove nas rotas do cadastro', async () => {
    const list = capture(() => Response.json({ data: [ITEM] }))
    expect(await list.client.list('12.345.678/0001-90')).toEqual([ITEM])
    expect(list.requests[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.example.test/delivery-clients/12.345.678%2F0001-90/whatsapp',
    })

    const write = capture(() => Response.json({ data: ITEM }))
    await write.client.add({ body: { label: 'balcão', number: '(16) 99999-1111' }, taxId: '1' })
    await write.client.update({ body: { number: '16 98888 2222' }, numberId: ITEM.id, taxId: '1' })
    expect(write.requests.map((request) => request.method)).toEqual(['POST', 'PATCH'])
    expect(write.requests[0]?.body).toEqual({ label: 'balcão', number: '(16) 99999-1111' })
    expect(write.requests[1]?.body).toEqual({ number: '16 98888 2222' })

    const remove = capture(() => new Response(null, { status: 204 }))
    await remove.client.remove({ numberId: ITEM.id, taxId: '1' })
    expect(remove.requests[0]?.method).toBe('DELETE')
  })

  test('item malformado derruba a leitura inteira', () => {
    expect(() => deliveryClientWhatsAppListFromApi({ data: [ITEM, { id: 'x' }] })).toThrow()
    expect(() => deliveryClientWhatsAppListFromApi({})).toThrow()
  })

  test('o número exige DDD e só pontuação comum', () => {
    expect(isDeliveryClientWhatsAppNumberValid('(16) 99999-1111')).toBe(true)
    expect(isDeliveryClientWhatsAppNumberValid('+55 16 99999 1111')).toBe(true)
    expect(isDeliveryClientWhatsAppNumberValid('99999-1111')).toBe(false)
    expect(isDeliveryClientWhatsAppNumberValid('abc')).toBe(false)
    expect(isDeliveryClientWhatsAppNumberValid('')).toBe(false)
  })

  test('os dois idiomas têm as mesmas chaves', () => {
    const keys = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === 'object' && inner !== null
          ? keys(inner as object, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      )
    expect(keys(settingsEn.clientWhatsApp).sort()).toEqual(keys(settingsPt.clientWhatsApp).sort())
  })
})
