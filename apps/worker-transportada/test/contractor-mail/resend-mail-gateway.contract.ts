/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createResendMailGateway } from '../../src/contractor-mail/infrastructure/resend-mail.gateway.js'
import {
  ResendDownloadHostNotAllowedError,
  ResendDownloadRedirectBlockedError,
  ResendDownloadTooLargeError,
  ResendProviderUnexpectedResponseError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'

const API_KEY = 're_synthetic_key'
const EMAILS_TARGET = 'https://api.resend.com/emails'

type Call = { readonly body: unknown; readonly init: RequestInit; readonly target: string }

type FakeFetch = {
  readonly calls: readonly Call[]
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>
}

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  })

const fakeFetch = (
  respond: (target: string, init: RequestInit) => Promise<Response>,
): FakeFetch => {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (target, init) => {
      calls.push({
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        init,
        target,
      })
      return respond(target, init)
    },
  }
}

const RECEIVED_EMAIL_BODY = {
  from: 'contratante@exemplo.com.br',
  headers: { 'Message-Id': '<abc@resend>' },
  message_id: '<abc@resend>',
  raw: {
    download_url: 'https://d1abc123.cloudfront.net/raw/message.eml?signature=xyz',
    expires_at: '2026-09-14T00:00:00.000Z',
  },
  subject: 'RE: Ocorrência',
  text: 'APROVADO',
  to: ['resposta.token@resposta.fernandes-transportadora.com.br'],
}

describe('resend mail gateway (spec 143 T007)', () => {
  test('sends the mail with reply_to, custom headers and the Idempotency-Key header', async () => {
    const stub = fakeFetch(async () => json({ id: 'email-id-1' }))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    const result = await gateway.sendEmail({
      apiKey: API_KEY,
      from: 'resposta@fernandes-transportadora.com.br',
      headers: { 'In-Reply-To': '<parent@resend>', References: '<parent@resend>' },
      idempotencyKey: 'message-id-42',
      replyTo: 'abc123@resposta.fernandes-transportadora.com.br',
      subject: 'Ocorrência de entrega',
      text: 'Corpo da mensagem',
      to: 'contratante@exemplo.com.br',
    })

    expect(result).toEqual({ id: 'email-id-1' })
    expect(stub.calls).toHaveLength(1)
    const [call] = stub.calls
    expect(call?.target).toBe(EMAILS_TARGET)
    expect(call?.init.method).toBe('POST')
    expect(call?.init.headers).toMatchObject({
      authorization: `Bearer ${API_KEY}`,
      'idempotency-key': 'message-id-42',
    })
    expect(call?.body).toEqual({
      from: 'resposta@fernandes-transportadora.com.br',
      headers: { 'In-Reply-To': '<parent@resend>', References: '<parent@resend>' },
      reply_to: 'abc123@resposta.fernandes-transportadora.com.br',
      subject: 'Ocorrência de entrega',
      text: 'Corpo da mensagem',
      to: ['contratante@exemplo.com.br'],
    })
  })

  test('rejects a send with a network failure as unreachable', async () => {
    const stub = fakeFetch(() => Promise.reject(new Error('ECONNRESET')))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.sendEmail({
        apiKey: API_KEY,
        from: 'resposta@fernandes-transportadora.com.br',
        headers: {},
        idempotencyKey: 'message-id-42',
        replyTo: 'abc123@resposta.fernandes-transportadora.com.br',
        subject: 'assunto',
        text: 'corpo',
        to: 'contratante@exemplo.com.br',
      }),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
  })

  test('fetches the received email and validates it against the schema', async () => {
    const stub = fakeFetch(async () => json(RECEIVED_EMAIL_BODY))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    const result = await gateway.fetchReceivedEmail({ apiKey: API_KEY, emailId: 'email-id-2' })

    expect(result).toEqual(RECEIVED_EMAIL_BODY)
    expect(stub.calls[0]?.target).toBe('https://api.resend.com/emails/receiving/email-id-2')
  })

  test('fails to fetch the received email when a required field is missing', async () => {
    const withoutRaw: Record<string, unknown> = { ...RECEIVED_EMAIL_BODY }
    delete withoutRaw.raw
    const stub = fakeFetch(async () => json(withoutRaw))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.fetchReceivedEmail({ apiKey: API_KEY, emailId: 'email-id-2' }),
    ).rejects.toBeInstanceOf(ResendProviderUnexpectedResponseError)
  })

  test('downloads the raw mime when the host is allowlisted', async () => {
    const stub = fakeFetch(async () => new Response('mime bytes', { status: 200 }))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    const buffer = await gateway.downloadRawEmail({
      downloadUrl: 'https://d1abc123.cloudfront.net/raw/message.eml',
    })

    expect(buffer.toString()).toBe('mime bytes')
    expect(stub.calls[0]?.init.redirect).toBe('manual')
  })

  test('refuses a download url whose host is not in the allowlist, without touching the network', async () => {
    const stub = fakeFetch(async () => new Response('mime bytes', { status: 200 }))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.downloadRawEmail({ downloadUrl: 'https://evil.example.com/raw/message.eml' }),
    ).rejects.toBeInstanceOf(ResendDownloadHostNotAllowedError)
    expect(stub.calls).toHaveLength(0)
  })

  test('refuses a plain http url even against an allowlisted host', async () => {
    const stub = fakeFetch(async () => new Response('mime bytes', { status: 200 }))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.downloadRawEmail({ downloadUrl: 'http://d1abc123.cloudfront.net/raw/message.eml' }),
    ).rejects.toBeInstanceOf(ResendDownloadHostNotAllowedError)
    expect(stub.calls).toHaveLength(0)
  })

  test('refuses a redirect, even one that points at another cloudfront host', async () => {
    const stub = fakeFetch(
      async () =>
        new Response(null, {
          headers: { location: 'https://attacker.cloudfront.net/steal' },
          status: 302,
        }),
    )
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.downloadRawEmail({ downloadUrl: 'https://d1abc123.cloudfront.net/raw/message.eml' }),
    ).rejects.toBeInstanceOf(ResendDownloadRedirectBlockedError)
  })

  test('aborts a download that crosses the size cap', async () => {
    const oversizedChunk = new Uint8Array(26 * 1024 * 1024)
    const stub = fakeFetch(async () => new Response(oversizedChunk, { status: 200 }))
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.downloadRawEmail({ downloadUrl: 'https://d1abc123.cloudfront.net/raw/message.eml' }),
    ).rejects.toBeInstanceOf(ResendDownloadTooLargeError)
  })

  test('rejects a download that times out as unreachable', async () => {
    const stub = fakeFetch(() =>
      Promise.reject(new DOMException('The signal timed out', 'TimeoutError')),
    )
    const gateway = createResendMailGateway({ fetch: stub.fetch })

    await expect(
      gateway.downloadRawEmail({ downloadUrl: 'https://d1abc123.cloudfront.net/raw/message.eml' }),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
  })
})
