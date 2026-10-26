/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T6 (RF2/RF3): o cliente das rotas do motorista da T4. O `GET` lê só endereços mascarados por `emailId`,
 * o `POST .../send` leva `emailIds`/`newAddress`/`save` e a `idempotencyKey` no corpo, e a resposta inválida é recusada.
 */
import { describe, expect, it } from 'bun:test'

import { createClientBoletoEmailApi } from '../../src/modules/client-email/shared/clientBoletoEmailApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'

const OCCURRENCE_ID = '0b9a4b8e-0000-4000-8000-000000000279'
const EMAIL_ID = '7d0c1a52-0000-4000-8000-000000000001'

function createApi(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const api = createClientBoletoEmailApi(
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

describe('e-mails do cliente para o boleto no app do motorista (spec 279 T6)', () => {
  it('lê os e-mails guardados, mascarados e por emailId', async () => {
    const { api, requests } = createApi(
      () =>
        new Response(
          JSON.stringify({
            data: {
              clientEmailType: 'boleto',
              clientEmails: [
                { addressMasked: 'a***@mercado.com', emailId: EMAIL_ID, label: 'Financeiro' },
              ],
              sentCount: 1,
              sentLimit: 5,
            },
          }),
        ),
    )
    const options = await api.list(OCCURRENCE_ID)
    expect(requests[0]?.method).toBe('GET')
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-emails`,
    )
    expect(options.clientEmails).toEqual([
      { addressMasked: 'a***@mercado.com', emailId: EMAIL_ID, label: 'Financeiro' },
    ])
    expect(options.sentLimit).toBe(5)
  })

  it('envia ids guardados sem endereço no corpo', async () => {
    const { api, requests } = createApi(
      () =>
        new Response(
          JSON.stringify({
            data: {
              results: [{ addressMasked: 'a***@mercado.com', emailId: EMAIL_ID, kind: 'queued' }],
              savedEmailId: null,
            },
          }),
          { status: 201 },
        ),
    )
    const outcome = await api.send({
      emailIds: [EMAIL_ID],
      idempotencyKey: 'key-1',
      occurrenceId: OCCURRENCE_ID,
    })
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-emails/send`,
    )
    expect(await requests[0]?.json()).toEqual({ emailIds: [EMAIL_ID], idempotencyKey: 'key-1' })
    expect(outcome.results[0]?.kind).toBe('queued')
    expect(outcome.savedEmailId).toBeNull()
  })

  it('leva o endereço novo e o "guardar" só quando pedido', async () => {
    const { api, requests } = createApi(
      () =>
        new Response(
          JSON.stringify({
            data: {
              results: [{ addressMasked: 'n***@x.com', emailId: null, kind: 'queued' }],
              savedEmailId: EMAIL_ID,
            },
          }),
        ),
    )
    const outcome = await api.send({
      idempotencyKey: 'key-2',
      newAddress: 'novo@x.com',
      occurrenceId: OCCURRENCE_ID,
      save: true,
    })
    expect(await requests[0]?.json()).toEqual({
      idempotencyKey: 'key-2',
      newAddress: 'novo@x.com',
      save: true,
    })
    expect(outcome.savedEmailId).toBe(EMAIL_ID)

    await api.send({
      idempotencyKey: 'key-3',
      newAddress: 'novo@x.com',
      occurrenceId: OCCURRENCE_ID,
    })
    expect(await requests[1]?.json()).toEqual({ idempotencyKey: 'key-3', newAddress: 'novo@x.com' })
  })

  it('recusa resposta fora do contrato e propaga o 409 do tipo desligado', async () => {
    const invalid = createApi(() => new Response(JSON.stringify({ data: { results: 'x' } })))
    const invalidError = await invalid.api
      .send({ emailIds: [EMAIL_ID], idempotencyKey: 'k', occurrenceId: OCCURRENCE_ID })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(invalidError).toBeInstanceOf(Error)

    const off = createApi(
      () =>
        new Response(JSON.stringify({ error: { code: 'OCCURRENCE_CLIENT_EMAIL_OFF' } }), {
          status: 409,
        }),
    )
    const offError = await off.api.list(OCCURRENCE_ID).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(offError).toMatchObject({ code: 'OCCURRENCE_CLIENT_EMAIL_OFF', status: 409 })
  })
})
