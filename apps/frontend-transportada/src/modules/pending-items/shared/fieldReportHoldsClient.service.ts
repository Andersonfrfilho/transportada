/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 320: os relatos do app que a API reteve por serem de outro dia. O escritório lê a lista e libera ou descarta.
 */
export type FieldReportHold = Readonly<{
  id: string
  invoiceNumber: null | string
  occurredAt: string
  occurrenceTypeName: null | string
  probableDuplicate: boolean
  receivedAt: string
  tappedAt: string
}>

export type FieldReportHoldDecision = 'discard' | 'release'

type Dependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type FieldReportHoldSettings = Readonly<{ enabled: boolean }>

export type FieldReportHoldsClient = Readonly<{
  decide: (input: Readonly<{ decision: FieldReportHoldDecision; id: string }>) => Promise<void>
  list: () => Promise<readonly FieldReportHold[]>
  readSettings: () => Promise<FieldReportHoldSettings>
  saveSettings: (enabled: boolean) => Promise<FieldReportHoldSettings>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): null | string {
  return typeof value === 'string' ? value : null
}

/** Item malformado sai da lista; a tela nunca cai por causa de uma linha. */
export function parseFieldReportHolds(payload: unknown): readonly FieldReportHold[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('FIELD_REPORT_HOLDS_INVALID_RESPONSE')
  }
  const holds: FieldReportHold[] = []
  for (const raw of payload.data as readonly unknown[]) {
    if (!isRecord(raw)) continue
    const id = readString(raw.id)
    const occurredAt = readString(raw.occurredAt)
    const receivedAt = readString(raw.receivedAt)
    const tappedAt = readString(raw.tappedAt)
    if (id === null || occurredAt === null || receivedAt === null || tappedAt === null) continue
    const display = isRecord(raw.display) ? raw.display : {}
    holds.push({
      id,
      invoiceNumber: readString(display.invoiceNumber),
      occurredAt,
      occurrenceTypeName: readString(display.occurrenceTypeName),
      probableDuplicate: readString(raw.probableDuplicateOf) !== null,
      receivedAt,
      tappedAt,
    })
  }
  return holds
}

export function parseFieldReportHoldSettings(payload: unknown): FieldReportHoldSettings {
  if (!isRecord(payload) || !isRecord(payload.data) || typeof payload.data.enabled !== 'boolean') {
    throw new Error('FIELD_REPORT_HOLDS_INVALID_RESPONSE')
  }
  return { enabled: payload.data.enabled }
}

export function createFieldReportHoldsClient(dependencies: Dependencies): FieldReportHoldsClient {
  async function call(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: string = '{}',
  ): Promise<unknown> {
    const accessToken = await dependencies.getAccessToken()
    const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
    if (method !== 'GET') headers['content-type'] = 'application/json'
    let response: Response
    try {
      response = await dependencies.fetch(
        new Request(`${dependencies.apiUrl}${path}`, {
          cache: 'no-store',
          headers,
          method,
          ...(method === 'GET' ? {} : { body }),
        }),
      )
    } catch {
      throw new Error('FIELD_REPORT_HOLDS_REQUEST_FAILED')
    }
    if (!response.ok) throw new Error('FIELD_REPORT_HOLDS_REQUEST_FAILED')
    try {
      return JSON.parse(await response.text()) as unknown
    } catch {
      throw new Error('FIELD_REPORT_HOLDS_RESPONSE_INVALID')
    }
  }

  return {
    async decide(input) {
      await call('POST', `/field-report-holds/${encodeURIComponent(input.id)}/${input.decision}`)
    },
    async readSettings() {
      return parseFieldReportHoldSettings(await call('GET', '/company-settings/field-report-hold'))
    },
    async saveSettings(enabled) {
      return parseFieldReportHoldSettings(
        await call('PUT', '/company-settings/field-report-hold', JSON.stringify({ enabled })),
      )
    },
    async list() {
      return parseFieldReportHolds(await call('GET', '/field-report-holds'))
    },
  }
}
