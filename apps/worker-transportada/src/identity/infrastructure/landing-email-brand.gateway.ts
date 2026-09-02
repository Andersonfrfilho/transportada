/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailBrandPort } from '../application/email-brand.port.js'
import type {
  CodeEmailBrand,
  CodeEmailContact,
  CodeEmailSocialLink,
} from '../domain/code-email-template.service.js'

/**
 * As mesmas rotas públicas que o site institucional e a tela de entrar consomem
 * (`/public/landing-settings`, `/public/landing-logo`). Rota nova só para o e-mail acrescentaria
 * superfície anônima para servir exatamente o mesmo byte, e uma cópia do schema de
 * `landing_settings` aqui obrigaria a resolver a raiz do CNPJ fora da app que a versiona.
 */
const PUBLIC_SETTINGS_PATH = '/public/landing-settings'
const PUBLIC_LOGO_PATH = '/public/landing-logo'
/** A marca muda raramente e cada convite é um envio: cinco minutos poupam a ida sem envelhecer. */
const CACHE_TTL_MILLISECONDS = 300_000
const REQUEST_TIMEOUT_MILLISECONDS = 5_000

type Dependencies = {
  /** Endereço da API desta instalação. Ausente, a marca é a do produto e nenhuma ida acontece. */
  readonly apiBaseUrl: string | undefined
  /** Origem do painel, de onde sai o desenho da Ada no rodapé. */
  readonly appBaseUrl: string | undefined
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

export function createLandingEmailBrandGateway(dependencies: Dependencies): EmailBrandPort {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch
  const now = dependencies.now ?? (() => Date.now())
  const fallback: CodeEmailBrand = {
    accentColor: undefined,
    apiBaseUrl: dependencies.apiBaseUrl,
    contacts: [],
    socialLinks: [],
    appBaseUrl: dependencies.appBaseUrl,
    contactEmail: undefined,
    contactPhone: undefined,
    logoUrl: undefined,
    name: undefined,
  }

  let cached: { readonly brand: CodeEmailBrand; readonly expiresAt: number } | undefined

  return {
    async read() {
      if (dependencies.apiBaseUrl === undefined) return fallback
      if (cached !== undefined && cached.expiresAt > now()) return cached.brand

      const brand = await readBrand({
        apiBaseUrl: dependencies.apiBaseUrl,
        fallback,
        fetch: fetchImplementation,
      })
      cached = { brand, expiresAt: now() + CACHE_TTL_MILLISECONDS }
      return brand
    },
  }
}

async function readBrand(input: {
  readonly apiBaseUrl: string
  readonly fallback: CodeEmailBrand
  readonly fetch: typeof globalThis.fetch
}): Promise<CodeEmailBrand> {
  const baseUrl = input.apiBaseUrl.endsWith('/') ? input.apiBaseUrl.slice(0, -1) : input.apiBaseUrl

  try {
    const response = await input.fetch(`${baseUrl}${PUBLIC_SETTINGS_PATH}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    })
    if (!response.ok) return input.fallback

    const payload: unknown = await response.json()
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined

    return {
      accentColor: readText(data?.accentColor),
      apiBaseUrl: baseUrl,
      contacts: readContacts(data?.contacts),
      socialLinks: readSocialLinks(data?.socialLinks),
      appBaseUrl: input.fallback.appBaseUrl,
      contactEmail: readText(data?.contactEmail),
      contactPhone: readText(data?.contactPhone),
      logoUrl: `${baseUrl}${PUBLIC_LOGO_PATH}`,
      name: readText(data?.brandName) ?? readOwnTradeName(data),
    }
  } catch {
    return input.fallback
  }
}

/**
 * `brandName` é campo do site institucional e é vazio em instalação que nunca montou landing. O
 * nome da transportadora chega no mesmo corpo, em `units[]`, vindo do cadastro de empresa — a
 * primeira unidade é a própria quando o grupo tem mais de um CNPJ.
 */
function readOwnTradeName(data: Record<string, unknown> | undefined): string | undefined {
  const units: unknown = data?.units
  if (!Array.isArray(units)) return undefined
  const own: unknown = units[0]
  return isRecord(own) ? readText(own.tradeName) : undefined
}

/**
 * A lista vem de rota pública, que é entrada não confiável: item sem forma de contato é descartado,
 * não interpretado. Uma linha ruim no cadastro não pode derrubar o e-mail inteiro.
 */
function readContacts(value: unknown): readonly CodeEmailContact[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const kind = item.kind
    const contactValue = readText(item.value)
    if ((kind !== 'phone' && kind !== 'email') || contactValue === undefined) return []

    return [
      {
        isWhatsapp: kind === 'phone' && item.isWhatsapp === true,
        kind,
        label: readText(item.label) ?? '',
        value: contactValue,
      },
    ]
  })
}

function readSocialLinks(value: unknown): readonly CodeEmailSocialLink[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const network = readText(item.network)
    const url = readText(item.url)
    /* `https` e nada mais, como o CHECK do banco — link de `http` em e-mail é aviso do cliente. */
    if (network === undefined || url === undefined || !url.startsWith('https://')) return []

    return [{ network, url }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
