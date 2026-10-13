/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 T4.6: levar o boleto da contratante ao motorista. O cliente chama a rota certa com o anexo escolhido e
 * lê só o desfecho; resposta fora do vocabulário é erro, nunca "entregue" por chute.
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const API_URL = 'https://api.example.test'

function createClient(response: Response, requests: Request[] = []) {
  return createOccurrenceConversationClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

describe('o cliente da entrega do boleto ao motorista (spec 248 T4.6)', () => {
  test('manda o anexo para a rota da ocorrência e devolve o desfecho', async () => {
    const requests: Request[] = []
    const client = createClient(jsonResponse({ data: { kind: 'delivered' } }, 201), requests)

    expect(
      await client.deliverContractorReplyToDriver({
        attachmentId: 'attachment-1',
        occurrenceId: 'occurrence-1',
      }),
    ).toBe('delivered')

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(new URL(request?.url ?? '').pathname).toContain(
      '/trip-occurrences/occurrence-1/contractor-reply/driver-delivery',
    )
    expect(await request?.json()).toEqual({ attachmentId: 'attachment-1' })
  })

  test('"já entregue" e "pulado" chegam como são', async () => {
    const input = { attachmentId: 'attachment-1', occurrenceId: 'occurrence-1' }
    expect(
      await createClient(
        jsonResponse({ data: { kind: 'already_delivered' } }),
      ).deliverContractorReplyToDriver(input),
    ).toBe('already_delivered')
    expect(
      await createClient(
        jsonResponse({ data: { kind: 'skipped', reason: 'driver_without_account' } }),
      ).deliverContractorReplyToDriver(input),
    ).toBe('skipped')
  })

  test('resposta sem desfecho conhecido é erro', async () => {
    const client = createClient(jsonResponse({ data: { kind: 'sent' } }))
    let failed = false
    try {
      await client.deliverContractorReplyToDriver({
        attachmentId: 'attachment-1',
        occurrenceId: 'occurrence-1',
      })
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
  })
})
