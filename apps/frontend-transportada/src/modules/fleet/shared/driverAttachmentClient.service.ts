/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isDriverAttachmentListResponse,
  type DriverAttachment,
} from './driverAttachment.validation'
import { driverAttachmentsPath } from './fleet.constant'

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
  list: (driverId: string) => Promise<readonly DriverAttachment[]>
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
  }
}
