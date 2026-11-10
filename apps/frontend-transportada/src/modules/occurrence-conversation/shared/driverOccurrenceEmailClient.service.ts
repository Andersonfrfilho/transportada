/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  toDriverOccurrenceEmailSettings,
  type DriverOccurrenceEmailSettings,
} from './driverOccurrenceEmail.service'
import type { ClientDependencies } from './occurrenceConversationClient.service'

export const DRIVER_OCCURRENCE_EMAIL_SETTINGS_PATH = '/company-settings/driver-occurrence-email'

export const DRIVER_OCCURRENCE_EMAIL_FAILURE = {
  FAILED: 'failed',
  FORBIDDEN: 'forbidden',
  INVALID: 'invalid',
  UNAUTHENTICATED: 'unauthenticated',
} as const

export type DriverOccurrenceEmailFailure =
  (typeof DRIVER_OCCURRENCE_EMAIL_FAILURE)[keyof typeof DRIVER_OCCURRENCE_EMAIL_FAILURE]

export class DriverOccurrenceEmailRequestError extends Error {
  public readonly failure: DriverOccurrenceEmailFailure

  public constructor(failure: DriverOccurrenceEmailFailure) {
    super(`DRIVER_OCCURRENCE_EMAIL_${failure.toUpperCase()}`)
    this.failure = failure
  }
}

export type DriverOccurrenceEmailClient = Readonly<{
  get: () => Promise<DriverOccurrenceEmailSettings>
  save: (enabled: boolean) => Promise<DriverOccurrenceEmailSettings>
}>

function failureOfStatus(status: number): DriverOccurrenceEmailFailure {
  if (status === 400) return DRIVER_OCCURRENCE_EMAIL_FAILURE.INVALID
  if (status === 401) return DRIVER_OCCURRENCE_EMAIL_FAILURE.UNAUTHENTICATED
  if (status === 403) return DRIVER_OCCURRENCE_EMAIL_FAILURE.FORBIDDEN
  return DRIVER_OCCURRENCE_EMAIL_FAILURE.FAILED
}

async function requestSettings(
  dependencies: ClientDependencies,
  init: Readonly<{ body?: Readonly<{ enabled: boolean }>; method: 'GET' | 'PUT' }>,
): Promise<DriverOccurrenceEmailSettings> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${DRIVER_OCCURRENCE_EMAIL_SETTINGS_PATH}`, {
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: init.method,
      }),
    )
  } catch {
    throw new DriverOccurrenceEmailRequestError(DRIVER_OCCURRENCE_EMAIL_FAILURE.FAILED)
  }
  if (!response.ok) throw new DriverOccurrenceEmailRequestError(failureOfStatus(response.status))
  const settings = toDriverOccurrenceEmailSettings(await response.json().catch(() => undefined))
  if (settings === null) {
    throw new DriverOccurrenceEmailRequestError(DRIVER_OCCURRENCE_EMAIL_FAILURE.FAILED)
  }
  return settings
}

/** Spec 322: a configuração por empresa (`settings.manage`). O corpo do `PUT` é só `{ enabled }`. */
export function createDriverOccurrenceEmailClient(
  dependencies: ClientDependencies,
): DriverOccurrenceEmailClient {
  return {
    get: () => requestSettings(dependencies, { method: 'GET' }),
    save: (enabled) => requestSettings(dependencies, { body: { enabled }, method: 'PUT' }),
  }
}
