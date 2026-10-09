/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DayCheckItem } from './holidayWarningPlan.service'
import type { HolidayWarning } from './trip.types'
import { isHolidayWarning } from './tripResponse.validation'

const DAY_CHECKS_PATH = '/business-calendar/day-checks'

export const DAY_CHECKS_ERROR = {
  REQUEST_FAILED: 'DAY_CHECKS_REQUEST_FAILED',
  RESPONSE_INVALID: 'DAY_CHECKS_RESPONSE_INVALID',
} as const

export class DayChecksRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'DayChecksRequestError'
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** Um `POST` só (a rota lê até 200 pares), para a montagem perguntar uma vez quando o solver termina. */
export type DayChecksClient = Readonly<{
  check: (items: readonly DayCheckItem[]) => Promise<readonly HolidayWarning[]>
}>

function readWarnings(payload: unknown): readonly HolidayWarning[] {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  if (!Array.isArray(data) || !data.every(isHolidayWarning)) {
    throw new DayChecksRequestError(DAY_CHECKS_ERROR.RESPONSE_INVALID)
  }
  return data
}

export function createDayChecksClient(dependencies: ClientDependencies): DayChecksClient {
  return {
    async check(items) {
      const accessToken = await dependencies.getAccessToken()
      let response: Response
      try {
        response = await dependencies.fetch(`${dependencies.apiUrl}${DAY_CHECKS_PATH}`, {
          body: JSON.stringify({ items }),
          cache: 'no-store',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          method: 'POST',
        })
      } catch {
        throw new DayChecksRequestError(DAY_CHECKS_ERROR.REQUEST_FAILED)
      }
      if (!response.ok) throw new DayChecksRequestError(DAY_CHECKS_ERROR.REQUEST_FAILED)
      return readWarnings(await response.json().catch(() => null))
    },
  }
}
