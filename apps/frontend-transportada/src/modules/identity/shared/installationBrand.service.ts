/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A marca da transportadora desta instalação, para a tela de entrar. Cada deploy é de uma
 * transportadora só (ADR-0021), então "a empresa" aqui não é ambígua — e quem chega antes de se
 * identificar precisa reconhecer de quem é o sistema.
 *
 * Vem das rotas **públicas que já existem** (`/public/landing-*`), as mesmas que o site
 * institucional consome. Uma rota nova só para isto acrescentaria superfície anônima para servir
 * exatamente o mesmo byte.
 */
const PUBLIC_SETTINGS_PATH = '/public/landing-settings'
const PUBLIC_LOGO_PATH = '/public/landing-logo'

export type InstallationBrand = {
  readonly logoUrl: string
  readonly name: string | null
}

type Dependencies = {
  readonly apiUrl: string
  readonly fetch: typeof globalThis.fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * `brandName` é campo do site institucional: opcional, e vazio em toda instalação que nunca montou
 * landing. O nome da transportadora chega no mesmo corpo, em `units[]`, vindo do cadastro de
 * empresa — e é a primeira unidade que é a própria, quando o grupo tem mais de um CNPJ. Ler só o
 * primeiro campo mostrava a marca do produto tendo a da empresa em mãos.
 */
function readOwnTradeName(data: Record<string, unknown> | undefined): string | null {
  const units: unknown = data?.units
  if (!Array.isArray(units)) return null
  const own: unknown = units[0]
  return isRecord(own) ? readText(own.tradeName) : null
}

/**
 * Falha e ausência dão no mesmo: a tela cai na marca do produto. Instalação recém-provisionada não
 * tem logotipo, e a rede cai — nenhum dos dois é motivo para segurar quem quer entrar.
 */
export async function readInstallationBrand({
  apiUrl,
  fetch,
}: Dependencies): Promise<InstallationBrand> {
  const logoUrl = `${apiUrl}${PUBLIC_LOGO_PATH}`

  try {
    const response = await fetch(`${apiUrl}${PUBLIC_SETTINGS_PATH}`)
    if (!response.ok) return { logoUrl, name: null }

    const payload: unknown = await response.json()
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined

    return { logoUrl, name: readText(data?.brandName) ?? readOwnTradeName(data) }
  } catch {
    return { logoUrl, name: null }
  }
}
