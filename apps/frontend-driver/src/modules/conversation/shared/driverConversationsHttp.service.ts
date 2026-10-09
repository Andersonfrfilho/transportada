/* Cópia por valor de apps/frontend-transportada/src/modules/occurrence-conversation/shared/occurrenceConversationClient.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_CONVERSATION_ERROR } from './driverConversation.constant'

export class DriverConversationRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
  }
}

export type DriverConversationHttpDependencies = Readonly<{
  baseUrl: string
  fetch: (request: Request) => Promise<Response>
  /** Buscado a cada chamada: o token rotaciona e um valor preso viraria credencial vencida. */
  getAccessToken: () => Promise<string>
}>

export type DriverConversationRequestInit = Readonly<{
  body?: object
  headers?: Readonly<Record<string, string>>
}>

export type DriverConversationHttp = Readonly<{
  getJson: (path: string) => Promise<unknown>
  postJson: (path: string, init?: DriverConversationRequestInit) => Promise<unknown>
  /** O PUT direto ao armazenamento, sem o token: a URL assinada já é a autorização. */
  putFile: (input: Readonly<{ file: File; url: string }>) => Promise<void>
}>

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return DRIVER_CONVERSATION_ERROR.REQUEST_FAILED
  }
  const { error } = payload
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : DRIVER_CONVERSATION_ERROR.REQUEST_FAILED
  }
  return DRIVER_CONVERSATION_ERROR.REQUEST_FAILED
}

async function readPayload(response: Response): Promise<unknown> {
  const rawBody = await response.text()
  if (rawBody.length === 0) return {}
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    throw new DriverConversationRequestError(
      response.ok
        ? DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID
        : DRIVER_CONVERSATION_ERROR.REQUEST_FAILED,
    )
  }
}

async function requestJson(
  dependencies: DriverConversationHttpDependencies,
  input: Readonly<{ method: 'GET' | 'POST'; path: string }> & DriverConversationRequestInit,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.baseUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...input.headers,
        },
        method: input.method,
      }),
    )
  } catch {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.REQUEST_FAILED)
  }
  const payload = await readPayload(response)
  if (!response.ok) throw new DriverConversationRequestError(readErrorCode(payload))
  return payload
}

async function putFile(
  dependencies: DriverConversationHttpDependencies,
  input: Readonly<{ file: File; url: string }>,
): Promise<void> {
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(input.url, {
        body: input.file,
        headers: { 'content-type': input.file.type },
        method: 'PUT',
      }),
    )
  } catch {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.UPLOAD_FAILED)
  }
  if (!response.ok)
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.UPLOAD_FAILED)
}

export function createDriverConversationHttp(
  dependencies: DriverConversationHttpDependencies,
): DriverConversationHttp {
  return {
    getJson: (path) => requestJson(dependencies, { method: 'GET', path }),
    postJson: (path, init) => requestJson(dependencies, { ...init, method: 'POST', path }),
    putFile: (input) => putFile(dependencies, input),
  }
}
