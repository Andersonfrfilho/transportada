/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 322: a configuração "e-mail do aviso de ocorrência do motorista" — o cliente HTTP, a leitura estrita da resposta
 * e os rótulos nos dois idiomas.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { toDriverOccurrenceEmailSettings } from '@/modules/occurrence-conversation/shared/driverOccurrenceEmail.service'
import { createDriverOccurrenceEmailClient } from '@/modules/occurrence-conversation/shared/driverOccurrenceEmailClient.service'

const API_URL = 'https://api.transportada.test'

function createClient(response: Response, requests: Request[]) {
  return createDriverOccurrenceEmailClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

async function failureOf(status: number): Promise<unknown> {
  return createClient(new Response(null, { status }), [])
    .get()
    .then(
      () => 'resolved',
      (error: { failure?: string }) => error.failure,
    )
}

describe('o cliente da configuração do e-mail do aviso (spec 322)', () => {
  test('lê pelo caminho certo, com o token e sem corpo', async () => {
    const requests: Request[] = []
    const settings = await createClient(
      Response.json({ data: { enabled: true, updatedAt: null } }),
      requests,
    ).get()
    expect(settings).toEqual({ enabled: true, updatedAt: undefined })
    const [request] = requests
    expect(request?.method).toBe('GET')
    expect(request?.url).toBe(`${API_URL}/company-settings/driver-occurrence-email`)
    expect(request?.headers.get('authorization')).toBe('Bearer synthetic-token')
    expect(request?.body).toBeNull()
  })

  test('grava com o corpo estrito { enabled } e devolve a resposta lida', async () => {
    const requests: Request[] = []
    const saved = await createClient(
      Response.json({ data: { enabled: false, updatedAt: '2026-11-10T21:00:00.000Z' } }),
      requests,
    ).save(false)
    expect(saved).toEqual({ enabled: false, updatedAt: '2026-11-10T21:00:00.000Z' })
    const [request] = requests
    expect(request?.method).toBe('PUT')
    expect(await request?.json()).toEqual({ enabled: false })
  })

  test('traduz o status em motivo, sem expor o corpo do servidor', async () => {
    expect(await failureOf(400)).toBe('invalid')
    expect(await failureOf(401)).toBe('unauthenticated')
    expect(await failureOf(403)).toBe('forbidden')
    expect(await failureOf(500)).toBe('failed')
  })

  test('resposta fora do contrato vira erro, não configuração', () => {
    for (const payload of [undefined, {}, { data: {} }, { data: { enabled: 'sim' } }]) {
      expect(toDriverOccurrenceEmailSettings(payload)).toBeNull()
    }
  })
})

describe('os rótulos da configuração do e-mail do aviso (spec 322)', () => {
  test('os dois idiomas têm as mesmas chaves', () => {
    const read = (file: string) =>
      (
        JSON.parse(readFileSync(`src/modules/occurrence-conversation/locales/${file}`, 'utf8')) as {
          driverOccurrenceEmail: Record<string, unknown>
        }
      ).driverOccurrenceEmail
    const pt = read('occurrenceConversation.locale.json')
    const en = read('occurrenceConversation.en.locale.json')
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort())
    expect(Object.keys(en.error as object).sort()).toEqual(Object.keys(pt.error as object).sort())
  })
})
