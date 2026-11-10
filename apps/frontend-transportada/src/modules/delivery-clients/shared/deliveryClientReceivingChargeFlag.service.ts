/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

/**
 * Spec 317 (E7, T6/T10): a marca "possível cobrança na entrega" do cliente. `GET`/`DELETE
 * /delivery-clients/:id/receiving-charge-flag` — ler é `fleet.read`, limpar é `fleet.manage`. Sem marca, os dois
 * campos vêm `null`.
 */
export type DeliveryClientReceivingChargeFlag = Readonly<{
  flaggedAt: string | null
  sourceStopOccurrenceId: string | null
}>

export class DeliveryClientReceivingChargeFlagError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DeliveryClientReceivingChargeFlagError'
  }
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string')
    throw new DeliveryClientReceivingChargeFlagError('RESPONSE_INVALID')
  return value
}

export function toReceivingChargeFlag(payload: unknown): DeliveryClientReceivingChargeFlag {
  const data =
    typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : null
  if (typeof data !== 'object' || data === null) {
    throw new DeliveryClientReceivingChargeFlagError('RESPONSE_INVALID')
  }
  const record = data as Record<string, unknown>
  return {
    flaggedAt: readNullableString(record.flaggedAt),
    sourceStopOccurrenceId: readNullableString(record.sourceStopOccurrenceId),
  }
}

type FlagDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DeliveryClientReceivingChargeFlagClient = Readonly<{
  clear: (deliveryClientId: string) => Promise<DeliveryClientReceivingChargeFlag>
  read: (deliveryClientId: string) => Promise<DeliveryClientReceivingChargeFlag>
}>

export function createDeliveryClientReceivingChargeFlagClient(
  dependencies: FlagDependencies,
): DeliveryClientReceivingChargeFlagClient {
  async function call(
    deliveryClientId: string,
    method: 'DELETE' | 'GET',
  ): Promise<DeliveryClientReceivingChargeFlag> {
    let response: Response
    try {
      response = await dependencies.fetch(
        new Request(
          `${dependencies.apiUrl}/delivery-clients/${encodeURIComponent(deliveryClientId)}/receiving-charge-flag`,
          {
            cache: 'no-store',
            headers: { authorization: `Bearer ${await dependencies.getAccessToken()}` },
            method,
          },
        ),
      )
    } catch {
      throw new DeliveryClientReceivingChargeFlagError('REQUEST_FAILED')
    }
    if (!response.ok) throw new DeliveryClientReceivingChargeFlagError('REQUEST_FAILED')
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new DeliveryClientReceivingChargeFlagError('RESPONSE_INVALID')
    }
    return toReceivingChargeFlag(payload)
  }

  return {
    clear: (deliveryClientId) => call(deliveryClientId, 'DELETE'),
    read: (deliveryClientId) => call(deliveryClientId, 'GET'),
  }
}

export function getDeliveryClientReceivingChargeFlagClient(): DeliveryClientReceivingChargeFlagClient {
  return createDeliveryClientReceivingChargeFlagClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
