/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isWhatsAppEvolutionConnectionResponse,
  isWhatsAppEvolutionQrResponse,
  isWhatsAppEvolutionResponse,
  type WhatsAppEvolutionConnection,
  type WhatsAppEvolutionQr,
  type WhatsAppEvolutionSaveInput,
  type WhatsAppEvolutionSettings,
} from './whatsappEvolution.validation'

export const WHATSAPP_EVOLUTION_PATH = '/company-settings/whatsapp-evolution'

const REQUEST_FAILED = 'WHATSAPP_EVOLUTION_REQUEST_FAILED'
const NETWORK_ERROR = 'WHATSAPP_EVOLUTION_NETWORK_ERROR'
const RESPONSE_INVALID = 'WHATSAPP_EVOLUTION_RESPONSE_INVALID'

/** `provisioningAvailable`: o ambiente tem o Evolution e a API cria a instância ("Criar e conectar"). */
export type WhatsAppEvolutionState = Readonly<{
  provisioningAvailable: boolean
  settings: WhatsAppEvolutionSettings | null
}>

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class WhatsAppEvolutionRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'WhatsAppEvolutionRequestError'
  }
}

export type WhatsAppEvolutionClient = Readonly<{
  connection: () => Promise<WhatsAppEvolutionConnection>
  disconnect: () => Promise<WhatsAppEvolutionConnection>
  get: () => Promise<WhatsAppEvolutionState>
  provision: (acknowledgeRisk: boolean) => Promise<WhatsAppEvolutionSettings>
  qr: () => Promise<WhatsAppEvolutionQr>
  save: (input: WhatsAppEvolutionSaveInput) => Promise<WhatsAppEvolutionSettings>
}>

async function send(
  input: Readonly<{
    body?: WhatsAppEvolutionSaveInput | Readonly<{ acknowledgeRisk: boolean }>
    dependencies: ClientDependencies
    method: string
    path: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: input.method,
      }),
    )
  } catch {
    throw new WhatsAppEvolutionRequestError(NETWORK_ERROR)
  }
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

async function readBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new WhatsAppEvolutionRequestError(readErrorCode(body))

  return body
}

export function createWhatsAppEvolutionClient(
  dependencies: ClientDependencies,
): WhatsAppEvolutionClient {
  return {
    async connection() {
      const body = await readBody(
        await send({ dependencies, method: 'GET', path: `${WHATSAPP_EVOLUTION_PATH}/connection` }),
      )
      if (!isWhatsAppEvolutionConnectionResponse(body)) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return body.data
    },
    async disconnect() {
      const body = await readBody(
        await send({ dependencies, method: 'POST', path: `${WHATSAPP_EVOLUTION_PATH}/disconnect` }),
      )
      if (!isWhatsAppEvolutionConnectionResponse(body)) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return body.data
    },
    async get() {
      const body = await readBody(
        await send({ dependencies, method: 'GET', path: WHATSAPP_EVOLUTION_PATH }),
      )
      if (!isWhatsAppEvolutionResponse(body)) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return {
        provisioningAvailable: body.provisioningAvailable === true,
        settings: body.data,
      }
    },
    async provision(acknowledgeRisk) {
      const body = await readBody(
        await send({
          body: { acknowledgeRisk },
          dependencies,
          method: 'POST',
          path: `${WHATSAPP_EVOLUTION_PATH}/provision`,
        }),
      )
      if (!isWhatsAppEvolutionResponse(body) || body.data === null) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return body.data
    },
    async qr() {
      const body = await readBody(
        await send({ dependencies, method: 'POST', path: `${WHATSAPP_EVOLUTION_PATH}/qr` }),
      )
      if (!isWhatsAppEvolutionQrResponse(body)) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return body.data
    },
    async save(input) {
      const body = await readBody(
        await send({ body: input, dependencies, method: 'PUT', path: WHATSAPP_EVOLUTION_PATH }),
      )
      if (!isWhatsAppEvolutionResponse(body) || body.data === null) {
        throw new WhatsAppEvolutionRequestError(RESPONSE_INVALID)
      }

      return body.data
    },
  }
}
