/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isDriverAttachmentListResponse,
  isDriverAttachmentResponse,
  isDriverAttachmentRevealResponse,
  isDriverAttachmentSuggestionResponse,
  type DriverAttachment,
  type DriverAttachmentSuggestion,
  type DriverAttachmentSuggestionDecision,
  type DriverAttachmentType,
} from './driverAttachment.validation'
import { driverAttachmentsPath } from './fleet.constant'

const ATTACHMENT_FILE_FIELD = 'file'
const ATTACHMENT_TYPE_FIELD = 'type'

const REQUEST_FAILED = 'DRIVER_ATTACHMENT_REQUEST_FAILED'
const NETWORK_ERROR = 'DRIVER_ATTACHMENT_NETWORK_ERROR'
const RESPONSE_INVALID = 'DRIVER_ATTACHMENT_RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class DriverAttachmentRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DriverAttachmentRequestError'
  }
}

export type DriverAttachmentClient = Readonly<{
  /** Aceitar ou descartar a leitura da CNH: a leitura some do servidor, e a ficha não muda. */
  decideSuggestion: (
    input: Readonly<{
      attachmentId: string
      decision: DriverAttachmentSuggestionDecision
      driverId: string
    }>,
  ) => Promise<void>
  list: (driverId: string) => Promise<readonly DriverAttachment[]>
  /** `fleet.manage`: o que a leitura do servidor achou na CNH, só os campos que a ficha recebe. */
  readSuggestion: (
    input: Readonly<{ attachmentId: string; driverId: string }>,
  ) => Promise<DriverAttachmentSuggestion>
  /** `fleet.reveal`: o link assinado do arquivo, de vida curta. */
  reveal: (input: Readonly<{ attachmentId: string; driverId: string }>) => Promise<string>
  remove: (input: Readonly<{ attachmentId: string; driverId: string }>) => Promise<void>
  upload: (
    input: Readonly<{ driverId: string; file: File; type: DriverAttachmentType }>,
  ) => Promise<DriverAttachment>
}>

export async function sendDriverAttachmentRequest(
  dependencies: ClientDependencies,
  input: Readonly<{
    body?: BodyInit
    headers?: Record<string, string>
    method: string
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiBaseUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}`, ...input.headers },
        method: input.method,
      }),
    )
  } catch {
    throw new DriverAttachmentRequestError(NETWORK_ERROR)
  }
  if (response.status === 204) return null
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new DriverAttachmentRequestError(readErrorCode(body))
  return body
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

export function createDriverAttachmentClient(
  dependencies: ClientDependencies,
): DriverAttachmentClient {
  return {
    async list(driverId) {
      const body = await sendDriverAttachmentRequest(dependencies, {
        method: 'GET',
        path: driverAttachmentsPath(driverId),
      })
      if (!isDriverAttachmentListResponse(body)) {
        throw new DriverAttachmentRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
    async decideSuggestion(input) {
      await sendDriverAttachmentRequest(dependencies, {
        body: JSON.stringify({ decision: input.decision }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        path: `${driverAttachmentsPath(input.driverId)}/${input.attachmentId}/suggestion`,
      })
    },
    async readSuggestion(input) {
      const body = await sendDriverAttachmentRequest(dependencies, {
        method: 'GET',
        path: `${driverAttachmentsPath(input.driverId)}/${input.attachmentId}/suggestion`,
      })
      if (!isDriverAttachmentSuggestionResponse(body)) {
        throw new DriverAttachmentRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
    async remove(input) {
      await sendDriverAttachmentRequest(dependencies, {
        method: 'DELETE',
        path: `${driverAttachmentsPath(input.driverId)}/${input.attachmentId}`,
      })
    },
    async reveal(input) {
      const body = await sendDriverAttachmentRequest(dependencies, {
        method: 'GET',
        path: `${driverAttachmentsPath(input.driverId)}/${input.attachmentId}/content`,
      })
      if (!isDriverAttachmentRevealResponse(body)) {
        throw new DriverAttachmentRequestError(RESPONSE_INVALID)
      }
      return body.data.url
    },
    async upload(input) {
      const form = new FormData()
      form.set(ATTACHMENT_TYPE_FIELD, input.type)
      form.set(ATTACHMENT_FILE_FIELD, input.file)
      // Sem `content-type`: o navegador monta o multipart com a fronteira dele.
      const body = await sendDriverAttachmentRequest(dependencies, {
        body: form,
        method: 'POST',
        path: driverAttachmentsPath(input.driverId),
      })
      if (!isDriverAttachmentResponse(body)) {
        throw new DriverAttachmentRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
  }
}
