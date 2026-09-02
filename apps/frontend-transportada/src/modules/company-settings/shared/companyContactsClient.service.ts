/* Copyright (c) 2026 Ada Technology. MIT License. */
const COMPANY_CONTACTS_PATH = '/company-settings/contacts'

/** Cópia por valor do catálogo da API: o bundle não carrega código dela (mesmo caso de `FUEL_TYPES`). */
export const COMPANY_SOCIAL_NETWORKS = [
  'website',
  'instagram',
  'facebook',
  'linkedin',
  'youtube',
  'tiktok',
  'x',
] as const

export type CompanySocialNetwork = (typeof COMPANY_SOCIAL_NETWORKS)[number]

export type CompanyContact = Readonly<{
  isWhatsapp: boolean
  kind: 'phone' | 'email'
  label: string
  value: string
}>

export type CompanySocialLink = Readonly<{
  network: CompanySocialNetwork
  url: string
}>

export type CompanyContactSettings = Readonly<{
  contacts: readonly CompanyContact[]
  socialLinks: readonly CompanySocialLink[]
}>

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export class CompanyContactsRequestError extends Error {
  public constructor() {
    super('COMPANY_CONTACTS_REQUEST_FAILED')
    this.name = 'CompanyContactsRequestError'
  }
}

export type CompanyContactsClient = Readonly<{
  getSettings: () => Promise<CompanyContactSettings>
  updateSettings: (input: CompanyContactSettings) => Promise<CompanyContactSettings>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Type guard manual, como o resto da app: a resposta da API é entrada de fronteira. */
function toSettings(value: unknown): CompanyContactSettings {
  const data = isRecord(value) && isRecord(value.data) ? value.data : undefined
  const contacts = Array.isArray(data?.contacts) ? data.contacts : []
  const socialLinks = Array.isArray(data?.socialLinks) ? data.socialLinks : []

  return {
    contacts: contacts.flatMap((item: unknown) => {
      if (!isRecord(item)) return []
      const kind = item.kind
      if (kind !== 'phone' && kind !== 'email') return []
      if (typeof item.value !== 'string') return []
      return [
        {
          isWhatsapp: item.isWhatsapp === true,
          kind,
          label: typeof item.label === 'string' ? item.label : '',
          value: item.value,
        },
      ]
    }),
    socialLinks: socialLinks.flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.url !== 'string') return []
      const network = COMPANY_SOCIAL_NETWORKS.find((candidate) => candidate === item.network)
      return network === undefined ? [] : [{ network, url: item.url }]
    }),
  }
}

async function buildRequest(
  input: Readonly<{ body?: unknown; dependencies: ClientDependencies; method: string }>,
): Promise<Request> {
  const accessToken = await input.dependencies.getAccessToken()
  return new Request(`${input.dependencies.apiBaseUrl}${COMPANY_CONTACTS_PATH}`, {
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
): Promise<CompanyContactSettings> {
  let response: Response
  try {
    response = await input.dependencies.fetch(input.request)
  } catch {
    throw new CompanyContactsRequestError()
  }
  if (!response.ok) throw new CompanyContactsRequestError()

  return toSettings(await response.json())
}

export function createCompanyContactsClient(
  dependencies: ClientDependencies,
): CompanyContactsClient {
  return {
    async getSettings() {
      const request = await buildRequest({ dependencies, method: 'GET' })
      return readResponse({ dependencies, request })
    },
    async updateSettings(input) {
      const request = await buildRequest({ body: input, dependencies, method: 'PUT' })
      return readResponse({ dependencies, request })
    },
  }
}

/** Só dígitos, como o banco guarda — a máscara é da tela, e o servidor recusa o que vier com ela. */
export function toPhoneDigits(value: string): string {
  return value.replaceAll(/\D/gu, '')
}

/** Máscara brasileira por comprimento; fora das medidas conhecidas o valor sai como veio. */
export function formatPhone(value: string): string {
  const digits = toPhoneDigits(value)
  const local = digits.length === 12 || digits.length === 13 ? digits.slice(2) : digits
  if (local.length !== 10 && local.length !== 11) return value

  return `(${local.slice(0, 2)}) ${local.slice(2, local.length - 4)}-${local.slice(-4)}`
}
