/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleLookup, FleetVehicleLookupPort } from '../application/fleet.port.js'
import { FleetVehicleLookupFailedError } from '../domain/fleet.error.js'
import { normalizeVehicleLookupPayload } from '../domain/vehicle-lookup-payload.policy.js'

const ACCEPT_HEADER = 'application/json'
const NOT_FOUND_STATUS = 404
const PLATE_PLACEHOLDERS = ['{placa}', '{plate}'] as const
const PLATE_QUERY_KEY = 'placa'
const REQUEST_TIMEOUT_MILLISECONDS = 8000

export type VehicleLookupConfiguration = {
  readonly token: string
  readonly url: string
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

/** Genérico de propósito: o provedor de placa é escolhido por env, e cada um nomeia os campos do seu jeito. */
export function createHttpVehicleLookupGateway(dependencies: {
  readonly configuration: VehicleLookupConfiguration
  readonly fetch: Fetch
}): FleetVehicleLookupPort {
  return {
    async lookupByPlate({ plate }): Promise<FleetVehicleLookup | null> {
      const response = await request({
        fetch: dependencies.fetch,
        target: buildTarget({ plate, url: dependencies.configuration.url }),
        token: dependencies.configuration.token,
      })

      if (response.status === NOT_FOUND_STATUS) return null
      if (!response.ok) throw new FleetVehicleLookupFailedError()
      return normalizeVehicleLookupPayload(await readJson(response))
    },
  }
}

function buildTarget(input: { readonly plate: string; readonly url: string }): string {
  const placeholder = PLATE_PLACEHOLDERS.find((candidate) => input.url.includes(candidate))
  if (placeholder !== undefined) return input.url.replaceAll(placeholder, input.plate)

  const target = new URL(input.url)
  target.searchParams.set(PLATE_QUERY_KEY, input.plate)
  return target.toString()
}

async function request(input: {
  readonly fetch: Fetch
  readonly target: string
  readonly token: string
}): Promise<Response> {
  try {
    return await input.fetch(input.target, {
      headers: {
        accept: ACCEPT_HEADER,
        ...(input.token === '' ? {} : { authorization: `Bearer ${input.token}` }),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    })
  } catch {
    throw new FleetVehicleLookupFailedError()
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new FleetVehicleLookupFailedError()
  }
}
