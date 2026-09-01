/* Copyright (c) 2026 Ada Technology. MIT License. */
const LANDING_SETTINGS_PATH = '/company-settings/landing'
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/u

export type LandingSettingsResponse = Readonly<{
  accentColor: string | null
  brandName: string | null
  contactEmail: string | null
  contactPhone: string | null
  sections: Readonly<Record<string, unknown>>
  updatedAt: string
}> | null

export type LandingSettingsUpdate = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: Readonly<Record<string, unknown>>
}>

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export class LandingPanelRequestError extends Error {
  public constructor() {
    super('LANDING_PANEL_REQUEST_FAILED')
    this.name = 'LandingPanelRequestError'
  }
}

export class LandingPanelInvalidAccentColorError extends Error {
  public constructor() {
    super('LANDING_PANEL_INVALID_ACCENT_COLOR')
    this.name = 'LandingPanelInvalidAccentColorError'
  }
}

export type LandingPanelClient = Readonly<{
  getSettings: () => Promise<LandingSettingsResponse>
  updateSettings: (input: LandingSettingsUpdate) => Promise<LandingSettingsResponse>
}>

async function buildRequest(
  input: Readonly<{
    body?: unknown
    dependencies: ClientDependencies
    method: string
  }>,
): Promise<Request> {
  const accessToken = await input.dependencies.getAccessToken()
  return new Request(`${input.dependencies.apiBaseUrl}${LANDING_SETTINGS_PATH}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    method: input.method,
  })
}

async function readResponse(
  input: Readonly<{ dependencies: ClientDependencies; request: Request }>,
): Promise<LandingSettingsResponse> {
  let response: Response
  try {
    response = await input.dependencies.fetch(input.request)
  } catch {
    throw new LandingPanelRequestError()
  }
  if (!response.ok) throw new LandingPanelRequestError()

  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) throw new LandingPanelRequestError()
  return (body as { data: LandingSettingsResponse }).data
}

export function createLandingPanelClient(dependencies: ClientDependencies): LandingPanelClient {
  return {
    async getSettings() {
      const request = await buildRequest({ dependencies, method: 'GET' })
      return readResponse({ dependencies, request })
    },
    async updateSettings(input) {
      if (input.accentColor !== undefined && !ACCENT_COLOR_PATTERN.test(input.accentColor)) {
        throw new LandingPanelInvalidAccentColorError()
      }

      const request = await buildRequest({ body: input, dependencies, method: 'PUT' })
      return readResponse({ dependencies, request })
    },
  }
}
