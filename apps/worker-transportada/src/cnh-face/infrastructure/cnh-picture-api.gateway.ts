/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O worker entrega o rosto à API e ela decide: resolve o usuário pelo anexo, aplica só sem foto própria
 * e publica o atributo no Keycloak. Sem lógica de identidade aqui (spec 295 Fase 4).
 */
import type { CnhProfilePicturePort } from '../application/cnh-face.port.js'
import type { MdfeAutoIssueEnvironment } from '../../shared/worker.types.js'

/** Renova antes de expirar: relógio de máquina anda, e um token na borda vira 401 esporádico. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 30
const WEBP_MIME_TYPE = 'image/webp'
/** Espelho de `API_FLEET_DRIVER_ATTACHMENT_CNH_PICTURE_PATH` da API; `test/cnh-face/backfill.contract.ts` cobra a paridade. */
export const CNH_PICTURE_API_PATH_TEMPLATE = '/fleet/driver-attachments/:attachmentId/cnh-picture'

export class CnhPictureApiError extends Error {
  public constructor(
    public readonly reason: 'api_unauthorized' | 'api_unreachable' | 'rejected',
    public readonly status?: number,
  ) {
    super(`cnh picture api: ${reason}${status === undefined ? '' : ` (${status})`}`)
    this.name = 'CnhPictureApiError'
  }
}

export type CreateCnhPictureApiGatewayParams = {
  readonly configuration: MdfeAutoIssueEnvironment
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

function toApiError(status: number): CnhPictureApiError {
  if (status === 401 || status === 403) return new CnhPictureApiError('api_unauthorized', status)
  if (status === 400 || status === 404) return new CnhPictureApiError('rejected', status)
  return new CnhPictureApiError('api_unreachable', status)
}

export function createCnhPictureApiGateway(
  input: CreateCnhPictureApiGatewayParams,
): CnhProfilePicturePort {
  const httpFetch = input.fetch ?? globalThis.fetch
  const now = input.now ?? ((): number => Date.now())
  let cached: { readonly expiresAtMs: number; readonly token: string } | null = null

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await httpFetch(url, init)
    } catch {
      throw new CnhPictureApiError('api_unreachable')
    }
  }

  async function accessToken(): Promise<string> {
    if (cached !== null && cached.expiresAtMs > now()) return cached.token

    const response = await send(input.configuration.tokenUrl, {
      body: new URLSearchParams({
        client_id: input.configuration.clientId,
        client_secret: input.configuration.clientSecret,
        grant_type: 'client_credentials',
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    })
    if (!response.ok) throw toApiError(response.status)

    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new CnhPictureApiError('api_unreachable', response.status)
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0
    cached = {
      expiresAtMs: now() + Math.max(0, expiresIn - TOKEN_EXPIRY_MARGIN_SECONDS) * 1_000,
      token: body.access_token,
    }
    return body.access_token
  }

  return {
    async apply({ attachmentId, companyId, image }) {
      const form = new FormData()
      form.set('file', new File([new Uint8Array(image)], 'rosto.webp', { type: WEBP_MIME_TYPE }))
      const response = await send(
        `${input.configuration.apiBaseUrl.replace(/\/$/, '')}${CNH_PICTURE_API_PATH_TEMPLATE.replace(':attachmentId', attachmentId)}`,
        {
          body: form,
          headers: { authorization: `Bearer ${await accessToken()}`, 'x-company-id': companyId },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        if (response.status === 401) cached = null
        throw toApiError(response.status)
      }

      const body = (await response.json()) as { data?: { applied?: unknown } }
      return { applied: body.data?.applied === true }
    },
  }
}
