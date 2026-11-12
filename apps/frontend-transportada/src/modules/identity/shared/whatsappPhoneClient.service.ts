/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  WHATSAPP_PHONE_ERROR,
  WHATSAPP_PHONE_PATH,
  WHATSAPP_PHONE_VERIFICATION_PATH,
} from './whatsappPhone.constant'
import type { WhatsAppPhoneState, WhatsAppPhoneVerification } from './whatsappPhone.types'
import {
  isRecord,
  isString,
  toWhatsAppPhoneState,
  toWhatsAppPhoneVerification,
} from './whatsappPhone.validation'

type RequestMethod = 'DELETE' | 'GET' | 'POST' | 'PUT'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type WhatsAppPhoneClient = Readonly<{
  readState: () => Promise<WhatsAppPhoneState>
  requestVerification: (input: Readonly<{ phone: string }>) => Promise<WhatsAppPhoneVerification>
  unbind: () => Promise<void>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return WHATSAPP_PHONE_ERROR.REQUEST_FAILED
}

function readEnvelopeData(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) invalidResponse()
  return payload.data
}

function invalidResponse(): never {
  throw requestError(WHATSAPP_PHONE_ERROR.RESPONSE_INVALID)
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: RequestMethod
    path: string
  }>,
): Promise<Readonly<{ payload: unknown }>> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    throw requestError(WHATSAPP_PHONE_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  if (rawBody.length === 0) {
    if (!response.ok) throw requestError(WHATSAPP_PHONE_ERROR.REQUEST_FAILED)
    return { payload: undefined }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(
      response.ok ? WHATSAPP_PHONE_ERROR.RESPONSE_INVALID : WHATSAPP_PHONE_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return { payload }
}

export function createWhatsAppPhoneClient(dependencies: ClientDependencies): WhatsAppPhoneClient {
  return {
    async readState() {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: WHATSAPP_PHONE_PATH,
      })
      return toWhatsAppPhoneState(readEnvelopeData(payload))
    },
    async requestVerification({ phone }) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ phone }),
        dependencies,
        method: 'POST',
        path: WHATSAPP_PHONE_VERIFICATION_PATH,
      })
      return toWhatsAppPhoneVerification(readEnvelopeData(payload))
    },
    async unbind() {
      await authorizedRequest({ dependencies, method: 'DELETE', path: WHATSAPP_PHONE_PATH })
    },
  }
}

export type CompanyUserWhatsAppPhoneClient = Readonly<{
  bind: (input: Readonly<{ phone: string; userId: string }>) => Promise<void>
  readState: (userId: string) => Promise<WhatsAppPhoneState>
  unbind: (userId: string) => Promise<void>
}>

const companyUserPath = (userId: string): string =>
  `/company-users/${encodeURIComponent(userId)}/whatsapp-phone`

/**
 * O administrador (`users.manage`) lê, grava já verificado e desfaz o WhatsApp de outra pessoa. Decisão do dono em
 * 10/11/2026: sem pedido de código; a API grava quem fez na trilha.
 */
export function createCompanyUserWhatsAppPhoneClient(
  dependencies: ClientDependencies,
): CompanyUserWhatsAppPhoneClient {
  return {
    async bind({ phone, userId }) {
      await authorizedRequest({
        body: JSON.stringify({ phone }),
        dependencies,
        method: 'PUT',
        path: companyUserPath(userId),
      })
    },
    async readState(userId) {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: companyUserPath(userId),
      })
      return toWhatsAppPhoneState(readEnvelopeData(payload))
    },
    async unbind(userId) {
      await authorizedRequest({ dependencies, method: 'DELETE', path: companyUserPath(userId) })
    },
  }
}
