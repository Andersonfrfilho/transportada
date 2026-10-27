/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T8 (RF3/RF10): o cliente das rotas do motorista da T5. O `GET` lê só números mascarados por `contactId`,
 * o `POST .../send` leva `contactIds`/`number`/`save` e a `idempotencyKey` no corpo, o reenvio leva só a chave e a
 * resposta inválida é recusada.
 */
import { describe, expect, it } from 'bun:test'

import { createClientBoletoWhatsAppApi } from '../../src/modules/client-whatsapp/shared/clientBoletoWhatsAppApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'

const OCCURRENCE_ID = '0b9a4b8e-0000-4000-8000-000000000281'
const CONTACT_ID = '7d0c1a52-0000-4000-8000-000000000001'
const DELIVERY_ID = '7d0c1a52-0000-4000-8000-000000000002'

function createApi(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const api = createClientBoletoWhatsAppApi(
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

describe('WhatsApp do cliente para o boleto no app do motorista (spec 281 T8)', () => {
  it('lê os números guardados mascarados, o estado do Evolution e as entregas', async () => {
    const { api, requests } = createApi(() =>
      json({
        data: {
          clientChannel: 'whatsapp',
          contacts: [{ contactId: CONTACT_ID, label: 'Compras', numberMasked: '+55 ••••8888' }],
          deliveries: [
            {
              createdAt: '2026-10-27T12:00:00.000Z',
              id: DELIVERY_ID,
              numberMasked: '+55 ••••8888',
              reason: 'whatsapp_disconnected',
              sentAt: null,
              status: 'failed',
            },
            { id: 'sem-campos', status: 'failed' },
          ],
          evolution: { connectionState: 'open', ready: true, status: 'enabled' },
          sentCount: 1,
          sentLimit: 5,
        },
      }),
    )

    const options = await api.list(OCCURRENCE_ID)

    expect(requests[0]?.url).toBe(
      `https://api.test/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-whatsapp`,
    )
    expect(options.contacts).toEqual([
      { contactId: CONTACT_ID, label: 'Compras', numberMasked: '+55 ••••8888' },
    ])
    expect(options.evolutionReady).toBe(true)
    expect(options.deliveries).toHaveLength(1)
    expect(options.deliveries[0]?.reason).toBe('whatsapp_disconnected')
  })

  it('motivo desconhecido de uma API mais nova vira falha genérica', async () => {
    const { api } = createApi(() =>
      json({
        data: {
          clientChannel: 'whatsapp',
          contacts: [],
          deliveries: [
            {
              createdAt: '2026-10-27T12:00:00.000Z',
              id: DELIVERY_ID,
              numberMasked: null,
              reason: 'algo_novo',
              sentAt: null,
              status: 'failed',
            },
          ],
          evolution: { ready: false },
          sentCount: 0,
          sentLimit: 5,
        },
      }),
    )

    const options = await api.list(OCCURRENCE_ID)

    expect(options.evolutionReady).toBe(false)
    expect(options.deliveries[0]?.reason).toBe('send_failed')
  })

  it('envia ids guardados e o número novo com save e a chave no corpo', async () => {
    const { api, requests } = createApi(() =>
      json(
        {
          data: {
            results: [
              {
                contactId: null,
                deliveryId: DELIVERY_ID,
                kind: 'sent',
                numberMasked: '+55 ••••8888',
                reason: null,
              },
            ],
            savedContactId: CONTACT_ID,
          },
        },
        201,
      ),
    )

    const outcome = await api.send({
      contactIds: [CONTACT_ID],
      idempotencyKey: 'key-1',
      number: '+5516999998888',
      occurrenceId: OCCURRENCE_ID,
      save: true,
    })

    expect(requests[0]?.url).toBe(
      `https://api.test/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-whatsapp/send`,
    )
    expect(await requests[0]?.json()).toEqual({
      contactIds: [CONTACT_ID],
      idempotencyKey: 'key-1',
      number: '+5516999998888',
      save: true,
    })
    expect(outcome.results[0]?.kind).toBe('sent')
    expect(outcome.savedContactId).toBe(CONTACT_ID)
  })

  it('não manda save nem listas vazias quando só reenvia o que já está guardado', async () => {
    const { api, requests } = createApi(() => json({ data: { results: [], savedContactId: null } }))

    await api.send({
      contactIds: [],
      idempotencyKey: 'key-2',
      occurrenceId: OCCURRENCE_ID,
      save: false,
      number: '+5516999998888',
    })

    expect(await requests[0]?.json()).toEqual({ idempotencyKey: 'key-2', number: '+5516999998888' })
  })

  it('reenvia uma entrega pelo caminho dela, só com a chave do pedido', async () => {
    const { api, requests } = createApi(() => json({ data: { results: [], savedContactId: null } }))

    await api.resend({
      deliveryId: DELIVERY_ID,
      idempotencyKey: 'key-3',
      occurrenceId: OCCURRENCE_ID,
    })

    expect(requests[0]?.url).toBe(
      `https://api.test/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-whatsapp/deliveries/${DELIVERY_ID}/resend`,
    )
    expect(await requests[0]?.json()).toEqual({ idempotencyKey: 'key-3' })
  })

  it('recusa a resposta sem a forma esperada', async () => {
    const { api } = createApi(() => json({ data: { results: 'nada' } }))

    const error = await api
      .send({ contactIds: [CONTACT_ID], idempotencyKey: 'key-4', occurrenceId: OCCURRENCE_ID })
      .then(
        () => undefined,
        (cause: unknown) => cause,
      )

    expect(error).toBeInstanceOf(Error)
  })
})
