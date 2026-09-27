/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { CONTRACTOR_MAIL_MAX_RECIPIENTS } from '../domain/contractor-mail.constant.js'
import { isAllowedResendDownloadUrl } from '../domain/resend-download-allowlist.constant.js'
import {
  ResendDownloadHostNotAllowedError,
  ResendDownloadRedirectBlockedError,
  ResendDownloadTooLargeError,
  ResendInvalidRecipientsError,
  ResendProviderUnauthorizedError,
  ResendProviderUnexpectedResponseError,
  ResendProviderUnreachableError,
} from '../domain/resend-provider.error.js'

/**
 * Spec 143 T007. As três operações que o trilho `contractor-mail-outbound.v1` e
 * `contractor-mail-inbound.v1` precisam do Resend, todas com `fetch` injetado e host fixo
 * (`https://api.resend.com`). Quem abre a credencial não é este gateway: ele recebe a `apiKey` já
 * aberta de quem o chama (plan.md § Segurança e tenant) — e nenhum log daqui carrega chave,
 * endereço, assunto ou corpo.
 */

type Fetch = (input: string, init: RequestInit) => Promise<Response>

const RESEND_BASE_URL = 'https://api.resend.com'
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000
/** Download de MIME bruto pode ser maior que uma chamada de API comum — prazo à parte. */
const DEFAULT_DOWNLOAD_TIMEOUT_MILLISECONDS = 30_000
/** O mesmo teto de entrada que Resend e Cloudflare já aplicam do lado deles. */
const MAX_RAW_EMAIL_BYTES = 25 * 1024 * 1024

const sentEmailSchema = z.object({ id: z.string().min(1) })

/**
 * Campos confirmados em
 * https://resend.com/docs/api-reference/emails/retrieve-received-email (`GET
 * /emails/receiving/{id}`). O corpo real traz mais campos (html, bcc, attachments…) que não
 * interessam aqui — o schema só declara o que o trilho de entrada usa. `cc` entrou na revisão da
 * T010: o token de resposta pode chegar em cópia ("responder a todos"), não só no `to`.
 */
const receivedEmailSchema = z.object({
  cc: z.array(z.string().min(1)).optional(),
  from: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  message_id: z.string().min(1),
  raw: z.object({
    download_url: z.string().min(1),
    expires_at: z.string().min(1),
  }),
  subject: z.string(),
  text: z.string().nullable(),
  to: z.array(z.string().min(1)).min(1),
})

export type ReceivedResendEmail = z.infer<typeof receivedEmailSchema>

/** Spec 183 T702e: o arquivo já em base64; o nome vai para quem recebe, nunca para log. */
export type ResendEmailAttachment = {
  readonly content: string
  readonly contentType: string
  readonly fileName: string
}

export type SendResendEmailInput = {
  readonly apiKey: string
  readonly attachments?: readonly ResendEmailAttachment[]
  readonly from: string
  readonly headers: Readonly<Record<string, string>>
  /** Spec 150 T302: sem HTML, o e-mail sai só em texto — a chave nem vai no corpo do POST. */
  readonly html?: string
  readonly idempotencyKey: string
  readonly replyTo: string
  readonly subject: string
  readonly text: string
  readonly to: readonly string[]
}

/** Quebra de linha injeta cabeçalho; vírgula e `<>` fariam um item virar lista ou nome+endereço. */
const FORBIDDEN_RECIPIENT_CHARACTERS = /[\r\n,<>]/

export type ResendMailGateway = {
  downloadRawEmail(input: { readonly downloadUrl: string }): Promise<Buffer>
  fetchReceivedEmail(input: {
    readonly apiKey: string
    readonly emailId: string
  }): Promise<ReceivedResendEmail>
  sendEmail(input: SendResendEmailInput): Promise<{ readonly id: string }>
}

export type CreateResendMailGatewayInput = {
  readonly downloadTimeoutMilliseconds?: number
  readonly fetch: Fetch
  readonly timeoutMilliseconds?: number
}

export function createResendMailGateway(input: CreateResendMailGatewayInput): ResendMailGateway {
  const { fetch } = input
  const timeoutMilliseconds = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS
  const downloadTimeoutMilliseconds =
    input.downloadTimeoutMilliseconds ?? DEFAULT_DOWNLOAD_TIMEOUT_MILLISECONDS

  return {
    async sendEmail(request) {
      if (!isValidRecipientList(request.to)) throw new ResendInvalidRecipientsError()

      const body = await requestJson({
        body: {
          ...(request.attachments === undefined || request.attachments.length === 0
            ? {}
            : {
                attachments: request.attachments.map((attachment) => ({
                  content: attachment.content,
                  content_type: attachment.contentType,
                  filename: attachment.fileName,
                })),
              }),
          from: request.from,
          headers: request.headers,
          ...(request.html === undefined ? {} : { html: request.html }),
          reply_to: request.replyTo,
          subject: request.subject,
          text: request.text,
          to: [...request.to],
        },
        fetch,
        headers: {
          authorization: `Bearer ${request.apiKey}`,
          'idempotency-key': request.idempotencyKey,
        },
        method: 'POST',
        timeoutMilliseconds,
        url: `${RESEND_BASE_URL}/emails`,
      })

      const parsed = sentEmailSchema.safeParse(body)
      if (!parsed.success) throw new ResendProviderUnexpectedResponseError(parsed.error)

      return { id: parsed.data.id }
    },

    async fetchReceivedEmail({ apiKey, emailId }) {
      const body = await requestJson({
        fetch,
        headers: { authorization: `Bearer ${apiKey}` },
        method: 'GET',
        timeoutMilliseconds,
        url: `${RESEND_BASE_URL}/emails/receiving/${encodeURIComponent(emailId)}`,
      })

      const parsed = receivedEmailSchema.safeParse(body)
      if (!parsed.success) throw new ResendProviderUnexpectedResponseError(parsed.error)

      return parsed.data
    },

    async downloadRawEmail({ downloadUrl }) {
      const url = safeParseUrl(downloadUrl)
      if (url === undefined || !isAllowedResendDownloadUrl(url)) {
        throw new ResendDownloadHostNotAllowedError()
      }

      let response: Response
      try {
        response = await fetch(downloadUrl, {
          /**
           * Nenhum redirecionamento é seguido, nem para um host da allowlist — a `download_url` já
           * é a URL final assinada pelo Resend, e um redirecionamento ali é sinal de algo errado,
           * não de uma etapa normal do download.
           */
          redirect: 'manual',
          signal: AbortSignal.timeout(downloadTimeoutMilliseconds),
        })
      } catch (error) {
        throw new ResendProviderUnreachableError(error)
      }

      if (response.status >= 300 && response.status < 400) {
        throw new ResendDownloadRedirectBlockedError()
      }
      if (response.status === 401 || response.status === 403) {
        throw new ResendProviderUnauthorizedError()
      }
      if (!response.ok) {
        throw new ResendProviderUnexpectedResponseError()
      }

      return readBoundedBody(response)
    },
  }
}

async function requestJson(params: {
  readonly body?: unknown
  readonly fetch: Fetch
  readonly headers: Readonly<Record<string, string>>
  readonly method: string
  readonly timeoutMilliseconds: number
  readonly url: string
}): Promise<unknown> {
  let response: Response
  try {
    response = await params.fetch(params.url, {
      body: params.body === undefined ? null : JSON.stringify(params.body),
      headers: {
        ...params.headers,
        ...(params.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      method: params.method,
      signal: AbortSignal.timeout(params.timeoutMilliseconds),
    })
  } catch (error) {
    throw new ResendProviderUnreachableError(error)
  }

  if (response.status === 401 || response.status === 403) {
    throw new ResendProviderUnauthorizedError()
  }
  if (!response.ok) {
    throw new ResendProviderUnexpectedResponseError()
  }

  try {
    return await response.json()
  } catch (error) {
    throw new ResendProviderUnexpectedResponseError(error)
  }
}

function isValidRecipientList(recipients: readonly string[]): boolean {
  if (recipients.length === 0) return false
  if (recipients.length > CONTRACTOR_MAIL_MAX_RECIPIENTS) return false
  return recipients.every((address) => !FORBIDDEN_RECIPIENT_CHARACTERS.test(address))
}

function safeParseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_RAW_EMAIL_BYTES) throw new ResendDownloadTooLargeError()
    return buffer
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > MAX_RAW_EMAIL_BYTES) {
      await reader.cancel()
      throw new ResendDownloadTooLargeError()
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks)
}
