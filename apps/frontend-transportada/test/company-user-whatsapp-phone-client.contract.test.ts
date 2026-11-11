/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createCompanyUserWhatsAppPhoneClient } from '../src/modules/identity/shared/whatsappPhoneClient.service'

const USER_ID = '00000000-0000-4000-8000-000000000053'

function createScenario(response: Response) {
  const calls: Request[] = []
  const client = createCompanyUserWhatsAppPhoneClient({
    apiUrl: 'http://api.test',
    fetch: (input) => {
      calls.push(input as Request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { calls, client }
}

describe('cliente do WhatsApp de outra pessoa (administrador)', () => {
  test('bind faz PUT em /company-users/:id/whatsapp-phone só com o número', async () => {
    const { calls, client } = createScenario(new Response(null, { status: 204 }))

    await client.bind({ phone: '(16) 99999-1234', userId: USER_ID })

    const [call] = calls
    expect(call?.method).toBe('PUT')
    expect(new URL(call?.url ?? '').pathname).toBe(`/company-users/${USER_ID}/whatsapp-phone`)
    expect(await call?.json()).toEqual({ phone: '(16) 99999-1234' })
    expect(call?.headers.get('authorization')).toBe('Bearer token')
  })

  test('readState lê o estado do envelope data, com o número mascarado', async () => {
    const { client } = createScenario(
      Response.json({ data: { phone: '+55 16 •••••-1234', status: 'verified' } }),
    )

    const state = await client.readState(USER_ID)

    expect(state.status).toBe('verified')
    expect(state.phone).toBe('+55 16 •••••-1234')
  })

  test('unbind faz DELETE e a recusa da API sobe o código estável', async () => {
    const ok = createScenario(new Response(null, { status: 204 }))
    await ok.client.unbind(USER_ID)
    expect(ok.calls[0]?.method).toBe('DELETE')

    const taken = createScenario(
      Response.json({ error: { code: 'WHATSAPP_PHONE_TAKEN' } }, { status: 409 }),
    )
    expect(taken.client.bind({ phone: '5516999991234', userId: USER_ID })).rejects.toThrow(
      'WHATSAPP_PHONE_TAKEN',
    )
  })
})
