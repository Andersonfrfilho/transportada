/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T4b (RF8): o cartão do e-mail escrito pelo motorista na conversa. O pendente chega só mascarado e forma
 * estranha não vira cartão; o envio vai pelo id da mensagem, com a chave no cabeçalho e `save` só quando pedido.
 */
import { describe, expect, test } from 'bun:test'

import {
  createDetectedClientEmailClient,
  isDetectedEmailSent,
  readPendingDetectedClientEmail,
} from '../../src/modules/occurrence-conversation/shared/detectedClientEmail.service'
import en from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'
import pt from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.locale.json'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000279402'
const MESSAGE_ID = '00000000-0000-4000-8000-000000279403'

describe('o e-mail digitado na conversa no painel (spec 279 T4b)', () => {
  test('lê o pendente mascarado; nada pendente ou forma estranha é null', () => {
    const pending = {
      addressMasked: 'f***@m***.com',
      createdAt: '2026-10-26T22:00:00.000Z',
      messageId: MESSAGE_ID,
    }
    expect(readPendingDetectedClientEmail({ data: pending })).toEqual(pending)
    expect(readPendingDetectedClientEmail({ data: null })).toBeNull()
    expect(readPendingDetectedClientEmail({ data: { addressMasked: 'f***@m***.com' } })).toBeNull()
    expect(readPendingDetectedClientEmail('x')).toBeNull()
  })

  test('envia pelo id da mensagem, com a chave no cabeçalho e save só quando pedido', async () => {
    const requests: { body: string; key: null | string; method: string; url: string }[] = []
    const client = createDetectedClientEmailClient({
      apiUrl: 'https://api.example.test',
      fetch: async (request) => {
        requests.push({
          body: await request.text(),
          key: request.headers.get('idempotency-key'),
          method: request.method,
          url: request.url,
        })
        return new Response(
          JSON.stringify({
            data: {
              results: [{ addressMasked: 'f***@m***.com', kind: 'queued', reason: null }],
              savedEmailId: null,
            },
          }),
          { status: 201 },
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const outcome = await client.send({
      idempotencyKey: 'client-email:1',
      messageId: MESSAGE_ID,
      occurrenceId: OCCURRENCE_ID,
      save: false,
    })
    await client.send({
      idempotencyKey: 'client-email:2',
      messageId: MESSAGE_ID,
      occurrenceId: OCCURRENCE_ID,
      save: true,
    })
    expect(isDetectedEmailSent(outcome)).toBe(true)
    expect(requests).toEqual([
      {
        body: '{}',
        key: 'client-email:1',
        method: 'POST',
        url: `https://api.example.test/trip-occurrences/${OCCURRENCE_ID}/contractor-reply/detected-client-email/${MESSAGE_ID}/send`,
      },
      {
        body: '{"save":true}',
        key: 'client-email:2',
        method: 'POST',
        url: `https://api.example.test/trip-occurrences/${OCCURRENCE_ID}/contractor-reply/detected-client-email/${MESSAGE_ID}/send`,
      },
    ])
  })

  test('só enviado ou já enviado fecha o cartão; os dois idiomas têm as mesmas chaves', () => {
    const of = (kind: 'already_queued' | 'failed' | 'queued' | 'skipped') => ({
      results: [{ addressMasked: 'f***@m***.com', kind, reason: null }],
      savedEmailId: null,
    })
    expect(isDetectedEmailSent(of('already_queued'))).toBe(true)
    expect(isDetectedEmailSent(of('failed'))).toBe(false)
    expect(isDetectedEmailSent(of('skipped'))).toBe(false)
    expect(Object.keys(en.detectedEmail).toSorted()).toEqual(
      Object.keys(pt.detectedEmail).toSorted(),
    )
    expect(pt.detectedEmail.question).toContain('{{address}}')
  })
})
